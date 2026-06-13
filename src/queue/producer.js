//producer.js
import { lastSyncQueue } from "./queue.js";
import { notificationQueue } from "./queue.js";
import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";

export async function notificationJob(req, res) {
  try {
    const { subdbname, userId } = req.body || {};

    if (!subdbname || !userId) {
      return res.status(400).json({
        success: false,
        message: "subdbname and userId are required",
      });
    }

    // 🔒 UNIQUE JOB PER USER + SUBDB
    const jobId = `notify_${subdbname}_${userId}`;

    const job = await notificationQueue.add(
      "notify-user", // ✅ JOB NAME
      {
        subdbname,
        userId, // ✅ LOGGED-IN USER
      },
      {
        jobId, // 🔒 PREVENT DUPLICATES
        repeat: {
          cron: "*/1 * * * *", // every minute (as you want)
        },
        removeOnComplete: true,
        removeOnFail: true,
      }
    );

    console.log(`✅ Job added: ${jobId}`);

    return res.json({
      success: true,
      message: "Notification job scheduled",
      jobId,
    });
  } catch (err) {
    console.error("notificationJob error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add notification job",
    });
  }
}

export const notificationToken = async (req, res) => {
  try {
    const bodyData = req.body;

    if (!req.headers.subdbname) {
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });
    }

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("UserID", sql.Int, bodyData.userId);
    request.input("Token", sql.NVarChar(sql.MAX), bodyData.token);
    request.input("SubDbName", sql.NVarChar(20), req.headers.subdbname);
    request.input("Platform", sql.NVarChar(20), bodyData.platform);
    request.input("CompanyCode", sql.Int, bodyData.companyCode);

    // ✅ Proper SP execution
    const result = await request.execute("sp_NotificationToken_Add");
    console.log(result  , 'result 35353');
    
    res.json({ success: true, message: "Token saved successfully", data : result?.recordset?.[0]});
  } catch (err) {
    console.error("Notification Token Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const notificationTokenDelete = async (req, res) => {
  try {
    const bodyData = req.body;
    const tokenId = req.params.id;
    console.log(bodyData, tokenId, 7755);
    
    if (!bodyData.subdbname) {
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });
    }

    const pool = await getPool(bodyData.subdbname);
    const request = pool.request();

    request.input("NotificationTokenCode", sql.Int, tokenId);
    request.input("CompanyCode", sql.Int, bodyData.companyCode);

    // ✅ Proper SP execution
    const result = await request.execute("sp_NotificationToken_Delete");

    res.json({ success: true, message: "Token deleted successfully" });
  } catch (err) {
    console.error("Notification Token Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getNotificationToken = async (req, res) => {
  try {
    const paramData = req.query;
    console.log(paramData,req.headers.subdbname, "paramData 32424");

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    // 3. Execute the stored procedure
    let result = await pool
      .request()
      .input("UserID", sql.Int, Number(paramData.userId))
      .input("SubDbName", sql.NVarChar(20), req.headers.subdbname)
      .input("CompanyCode", sql.Int, Number(paramData.companyCode))
      .execute("sp_NotificationToken_GetAll");
  console.log(result,'result 453411');
  
    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getNotificationTokenList = async (
  subdbname,
  userId,
  companyCode
) => {
  try {
    console.log(subdbname, userId, companyCode,"22223333''''''''''''''''''''");
    
    if (!subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(subdbname);

    // 3. Execute the stored procedure
    let result = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("SubDbName", sql.NVarChar(20), subdbname)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_NotificationToken_GetAll");

    return {
      totalRecords: result.recordset.length,
      data: result.recordset,
    };
  } catch (err) {
    return { error: err.message };
  }
};

// CALL THIS FUNCTION FROM index.js
export const scheduleLastSyncJob = async (subdbname) => {
  await lastSyncQueue.add(
    "fetchLastSync",
    { subdbname },
    {
      repeat: { every: 150000 },
      jobId: `lastsync_${subdbname}`, // 🔥 UNIQUE FOR EACH DB
    }
  );

  console.log("⏱ LastSync Repeat Job Scheduled For:", subdbname);
};
