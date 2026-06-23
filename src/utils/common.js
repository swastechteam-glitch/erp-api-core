import crypto from "crypto";
import sql from "mssql";

export function decryptData(encryptedText) {
  const passphrase = "SWAS";

  const md5Key = crypto.createHash("md5").update(passphrase, "utf8").digest();

  const decipher = crypto.createDecipheriv(
    "des-ede3",
    Buffer.concat([md5Key, md5Key.slice(0, 8)]),
    null,
  );
  decipher.setAutoPadding(true);

  let decrypted = decipher.update(encryptedText, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// export async function checkDate(givenDate, FYCode) {
//   // const pool = await sql.connect(dbConfig);
//   const pool = await poolPromise;
//   const result = await pool
//     .request()
//     .input("FyCode", sql.Int, FYCode)
//     .query("EXEC sp_FYear_GetAll @FyCode = @FyCode");

//   if (result.recordset.length > 0) {
//     const fyStart = new Date(result.recordset[0].FyStart);
//     const fyEnd = new Date(result.recordset[0].fyend);

//     if (givenDate >= fyStart && givenDate <= fyEnd) {
//       return true;
//     } else {
//       return false;
//     }
//   }
//   return false;
// }

export async function currentYear() {
  const currentYear = new Date().getFullYear();
  return currentYear;
}

export const formatDate = (date) => {
  if (!date) return "-"; // fallback if empty/null

  const newDate = new Date(date);
  const dateOnly = newDate.toISOString().split("T")[0];

  return dateOnly; // 09-09-2025
};

export function dMY(dateValue) {
  const date = new Date(dateValue);

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  return `${dd}-${mm}-${yyyy}`;
}

export function getFilterCurrentDate() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, "0");
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const year = today.getFullYear();
  return `${year}-${month}-${day}`;
}

export async function getNetworkTime() {
  try {
    const url =
      "https://timeapi.io/api/Time/current/zone?timeZone=Asia/Kolkata";

    const res = await fetch(url);
    const data = await res.json();

    let hours = data.hour;
    let minutes = data.minute;
    let seconds = data.seconds;

    // AM/PM conversion
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    // Format time
    const timeString =
      `${hours.toString().padStart(2, "0")}:` +
      `${minutes.toString().padStart(2, "0")}:` +
      `${seconds.toString().padStart(2, "0")} ${ampm}`;

    return timeString;
  } catch (err) {
    console.error("Network Time API failed:", err);

    // fallback using system time
    const t = new Date();
    let h = t.getHours();
    let m = t.getMinutes();
    let s = t.getSeconds();

    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;

    return (
      `${h.toString().padStart(2, "0")}:` +
      `${m.toString().padStart(2, "0")}:` +
      `${s.toString().padStart(2, "0")} ${ampm}`
    );
  }
}

export const showBranchDropDown = (subdbname) => {
   const SHOW_BRANCH_DROPDOWN = subdbname === "KPF";
  return SHOW_BRANCH_DROPDOWN
};

export const applyBranchCode = (request, headers) => {
  const bCode = headers["branchCode"] || headers["branchcode"];
  const companyCode = headers["companyCode"] || headers["companyCode"];
  const subdbname = showBranchDropDown(headers.subdbname)
  console.log(companyCode, bCode, headers.branchCode, subdbname, "Branch code");
  // if (bCode && headers.subdbname == "KPF" ) {
  if (subdbname) {
    request.input("BranchCode", sql.Int, parseInt(bCode));
  } else {
    // if (companyCode) {
      request.input("CompanyCode", sql.Int, parseInt(companyCode));
    // }
  }
};

// export const scalarRaw = async (request, proc) => {
//   const r = await request.execute(proc);
//   const row = r.recordset?.[0];
//   return row ? Object.values(row)[0] : null;
// };


