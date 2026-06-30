import net from "net";
import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Download From Machine (port of the WinForms frmAutoDownload)
//
//   Talks to ZK biometric attendance terminals over the LAN. The desktop used
//   the Windows ActiveX SDK (zkemkeeper); here we use the pure-JS node-zklib so
//   the CORE service (which must run ON-PREM, able to reach the terminals on
//   ports like 4370) can connect, read punch logs and store them.
//
//   Flow (faithful to AttenDownload):
//     1. machines: tbl_BioMatrixMachine (DataTo='ATTEN', MachineType='A', Status=1)
//     2. per machine: connect -> read logs >= From date -> sp_DownloadEntry_AddEdit
//     3. sp_ImportRecords (@CompanyCode)
//     4. (company 1 or 2) sp_Generate_Attendance_New_Unit1 (PayType 1 & 2, today)
//
//   Device reads + sp_Generate_Attendance can take minutes — far longer than the
//   gateway's 60s forwarder timeout — so /download runs as a BACKGROUND JOB and
//   the UI polls /progress/:runId (this also drives the live "Machine X: i/N"
//   status, like the desktop lblStatus). Job state is kept in-memory (the core
//   service is a single on-prem process).
//
//   Endpoints
//     GET  /status                 machine list + last download + reachability
//     POST /download               start a background download, returns { runId }
//     GET  /progress/:runId        poll a running/finished download
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const pick = (row, ...keys) => {
  if (!row) return undefined;
  for (const k of keys) {
    if (k == null) continue;
    if (row[k] !== undefined) return row[k];
    const lk = String(k).toLowerCase();
    const hit = Object.keys(row).find((o) => o.toLowerCase() === lk);
    if (hit) return row[hit];
  }
  return undefined;
};
const pad = (n) => String(n).padStart(2, "0");
// SQL datetime (UTC-encoded by tedious) -> "DD/MM/YYYY HH:mm:ss" for display.
const fmtDT = (v) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
// today as "YYYY-MM-DD"
const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// a device record's clock time -> "YYYY-MM-DD HH:mm:ss" (local, as the device reported)
const recDT = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;

// TCP reachability probe — a fast stand-in for the desktop's Connect_Net check.
const ping = (ip, port, timeoutMs = 3500) =>
  new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    try {
      sock.connect(toInt(port) || 4370, String(ip || "").trim());
    } catch {
      finish(false);
    }
  });

// ---- in-memory job registry (single on-prem core process) -----------------
const jobs = new Map();
let runSeq = 0;

// GET /download-machine/status
export const getStatus = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const machinesRs = await pool
      .request()
      .query(
        "Select * from tbl_BioMatrixMachine where DataTo = 'ATTEN' AND MachineType = 'A' AND Status = 1"
      );
    const lastRs = await pool
      .request()
      .query(
        "select MachineCode, MAX(AttenDateTime) AS MaxDate from tbl_DownloadEntry WHERE AttenDateTime < '2050-01-01' GROUP BY MachineCode"
      );
    const lastMap = new Map(
      (lastRs.recordset || []).map((r) => [toInt(pick(r, "MachineCode")), pick(r, "MaxDate")])
    );

    const machines = (machinesRs.recordset || []).map((m) => ({
      MachineCode: toInt(pick(m, "MachineCode")),
      MachineName: (pick(m, "MachineName") ?? "").toString().trim(),
      MachineIP: (pick(m, "MachineIP") ?? "").toString().trim(),
      PortNo: (pick(m, "PortNo") ?? "").toString().trim(),
      Mode: (pick(m, "InOutMode") ?? "").toString().trim(),
    }));

    // probe all machines in parallel (bounded by the short per-socket timeout)
    const reach = await Promise.all(machines.map((m) => ping(m.MachineIP, m.PortNo)));

    const data = machines.map((m, i) => ({
      ...m,
      Status: reach[i] ? "Connected" : "Disconnected",
      LastDownload: fmtDT(lastMap.get(m.MachineCode)),
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (DownloadMachine.getStatus):", err);
    return sendError(res, err);
  }
};

// The background worker — reads each machine and stores logs, then post-processes.
async function runDownload(job, ctx) {
  const { subdbname, companyCode, userId, nodeCode, fromDate } = ctx;
  const fromMidnight = new Date(`${fromDate}T00:00:00`);
  const refDate = todayYMD();
  let ZKLib;
  try {
    ZKLib = (await import("node-zklib")).default;
  } catch (e) {
    job.status = "error";
    job.message = "node-zklib is not available on the server";
    job.lines.push(job.message);
    return;
  }

  try {
    const pool = await getPool(subdbname);
    const machinesRs = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .query(
        "Select * from tbl_BioMatrixMachine Where DataTo = 'ATTEN' AND MachineType = 'A' AND CompanyCode = @CompanyCode AND Status = 1"
      );
    const machines = machinesRs.recordset || [];
    job.totalMachines = machines.length;

    for (const m of machines) {
      const code = toInt(pick(m, "MachineCode"));
      const name = (pick(m, "MachineName") ?? "").toString().trim();
      const ip = (pick(m, "MachineIP") ?? "").toString().trim();
      const port = toInt(pick(m, "PortNo")) || 4370;
      const inOutMode = toInt(pick(m, "InOutMode"));
      const mResult = { MachineCode: code, MachineName: name, count: 0, status: "" };

      let zk;
      try {
        job.lines.push(`Connecting ${name} (${ip}:${port})…`);
        zk = new ZKLib(ip, port, 10000, 4000);
        await zk.createSocket();

        const logs = await zk.getAttendances();
        const records = (logs && logs.data) || [];

        // keep records on/after the From date (date-only compare, like the desktop)
        const fresh = records.filter((r) => {
          const t = r.recordTime instanceof Date ? r.recordTime : new Date(r.recordTime);
          if (Number.isNaN(t.getTime())) return false;
          const day = new Date(t.getFullYear(), t.getMonth(), t.getDate());
          return day >= fromMidnight;
        });

        let i = 0;
        for (const r of fresh) {
          const t = r.recordTime instanceof Date ? r.recordTime : new Date(r.recordTime);
          const empMachineId = toInt(r.deviceUserId ?? r.userId ?? r.uid);
          const verifyMode = toInt(r.verifyMode ?? r.type ?? r.state ?? 0);
          await pool
            .request()
            .input("RefDate", sql.VarChar(10), refDate)
            .input("MachineCode", sql.Int, code)
            .input("EmpMachineID", sql.Int, empMachineId)
            .input("InOutMode", sql.Int, inOutMode)
            .input("VerifyMode", sql.Int, verifyMode)
            .input("AttenDateTime", sql.VarChar(19), recDT(t))
            .input("CompanyCode", sql.Int, companyCode)
            .input("User", sql.Int, toInt(userId))
            .input("Node", sql.Int, toInt(nodeCode))
            .execute("sp_DownloadEntry_AddEdit");
          i += 1;
          job.saved += 1;
          if (i % 25 === 0 || i === fresh.length)
            job.lines.push(`Machine ${code} : ${i} / ${fresh.length}`);
        }
        mResult.count = fresh.length;
        mResult.status = "Done";
        job.lines.push(`Machine ${code} (${name}) : ${fresh.length} record(s) saved`);
      } catch (err) {
        mResult.status = "Failed";
        job.lines.push(`Machine ${code} (${name}) : ${err.message || "connect/read failed"}`);
      } finally {
        try {
          if (zk) await zk.disconnect();
        } catch {
          /* ignore */
        }
      }
      job.machines.push(mResult);
    }

    // ---- Import Records ----------------------------------------------------
    job.lines.push("Importing records…");
    await pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_ImportRecords");

    // ---- Generate Attendance (company 1 / 2 only, like the desktop) --------
    if (companyCode === 1 || companyCode === 2) {
      for (const payType of [1, 2]) {
        job.lines.push(`Generating attendance (PayType ${payType})…`);
        const rq = pool.request();
        rq.timeout = 600000; // mirror the desktop CommandTimeout = 600
        await rq
          .input("PayTypeCode", sql.Int, payType)
          .input("FromDate", sql.VarChar(10), refDate)
          .input("ToDate", sql.VarChar(10), refDate)
          .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_Generate_Attendance_New_Unit1");
      }
    }

    job.status = "done";
    job.message = "Download Completed";
    job.lines.push("Download Completed");
  } catch (err) {
    job.status = "error";
    job.message = err.message || "Download failed";
    job.lines.push(`Error: ${job.message}`);
    console.error("DB Error (DownloadMachine.runDownload):", err);
  }
}

// POST /download-machine/download  -> start a background download
export const startDownload = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);

    const fromDate = (req.body?.fromDate || todayYMD()).toString().slice(0, 10);

    runSeq += 1;
    const runId = `dl_${runSeq}`;
    const job = {
      runId,
      status: "running",
      message: "",
      lines: ["Starting download…"],
      machines: [],
      totalMachines: 0,
      saved: 0,
    };
    jobs.set(runId, job);
    // prune old finished jobs (keep the registry small)
    if (jobs.size > 20) {
      for (const [k, v] of jobs) {
        if (v.status !== "running") {
          jobs.delete(k);
          if (jobs.size <= 20) break;
        }
      }
    }

    // fire-and-forget (do not await) — the UI polls /progress
    runDownload(job, {
      subdbname: req.headers.subdbname,
      companyCode,
      userId,
      nodeCode,
      fromDate,
    });

    return sendSuccess(res, { runId }, "Download started", 202);
  } catch (err) {
    console.error("DB Error (DownloadMachine.startDownload):", err);
    return sendError(res, err);
  }
};

// GET /download-machine/progress/:runId
export const getProgress = async (req, res) => {
  const job = jobs.get(req.params.runId);
  if (!job) return sendError(res, "Download run not found", 404);
  return sendSuccess(res, {
    runId: job.runId,
    status: job.status,
    message: job.message,
    lines: job.lines,
    machines: job.machines,
    totalMachines: job.totalMachines,
    saved: job.saved,
  });
};
