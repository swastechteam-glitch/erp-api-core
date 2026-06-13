// // worker.js
// import { Worker } from "bullmq";
// import { redisConnection } from "./redis.js";

// const worker = new Worker(
//   "sample-job-queue",
//   async (job) => {
//     console.log("Processing job:", job.id, job.data);

//     // EXAMPLE PROCESSING
//     console.log("Message:", job.data.message);
//     console.log("User:", job.data.Name);
//     console.log("Sub DB:", job.data.subdbname);

//     // send socket / notification here
//     return { success: true };
//   },
//   { connection: redisConnection }
// );

// worker.on("completed", (job) =>
//   console.log(`Job ${job.id} completed`)
// );

// worker.on("failed", (job, err) =>
//   console.log(`Job ${job.id} failed:`, err)
// );

import sql from "mssql";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import admin from "firebase-admin";
import dotenv from "dotenv";
import { getPool } from "../config/dynamicDB.js";
import { io } from "../../index.js";
import { redisConfig, redisConnection } from "./redis.js";
// import { notificationsUpdate } from "../controllers/notifications.comtroller.js";

dotenv.config();

export const getNotificationCountQueue = async (subdbname) => {
  try {
    // const subdbname = req.headers.subdbname;
    // const userId = req.headers.userId;
    if (!subdbname) {
      return {
        success: false,
        message: "Missing subDBName",
      };
    }

    const pool = await getPool(subdbname);

    const result = await pool.request().query(`
      SELECT COUNT(*) AS UnreadCount 
      FROM tbl_Notification 
      WHERE IsNotify = 0;

      SELECT * 
      FROM tbl_Notification  
      WHERE IsNotify = 0 
      ORDER BY CreatedAt DESC;
    `);

    // console.log(result?.recordsets?.[1], "SQL Result");

    // console.log(notificationID, "notificationID");
    return {
      success: true,
      count: result.recordset[0].UnreadCount,
      data: result?.recordsets?.[1],
    };
  } catch (err) {
    console.error("SQL error", err);

    return { success: false, error: err.message };
  }
};

// Redis connection for Worker
// const redisConnection = new Redis({
//   host: process.env.REDIS_HOST,
//   port: Number(process.env.REDIS_PORT),
//   password: process.env.REDIS_PASS,
//   maxRetriesPerRequest: null,
//   enableReadyCheck: false,
// });

// export const redisConnection = new Redis({
//   host: redisConfig.host ,
//   port: redisConfig.port,
//   password: redisConfig.password,
//   maxRetriesPerRequest: null,
// });

// console.log(redisConfig.host, redisConfig.port, redisConfig.password, 443333);

// ======== Worker ========

// console.log(redisConnection, "redisConnection------------- ");

const worker = new Worker(
  "notification-queue",
  async (job) => {
    console.log("👷 Processing job:", job.name, job.id, job.data);


   return {
  status: "done",
  subdbname: job.data.subdbname,
  userId: job.data.userId,
};
  },
  {
    connection: {
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
    },
    removeOnComplete: false,
    removeOnFail: false,
  }
);


/* ---------------- LastSync Worker ---------------- */
const lastSyncWorker = new Worker(
  "last-sync-queue",
  async (job) => {
    console.log("⏱ Running LastSync Job", job.data);

    const { subdbname } = job.data;
    if (!subdbname) return { status: "no-subdbname" };

    const pool = await getPool(subdbname);
    console.log(subdbname, "subdbname-----------------");

    const result = await pool
      .request()
      .execute("web_sp_DashBoard_Update_LastSync_Scheduler");

    const lastSync = result.recordset?.[0] || null;
    const lastSyncTime = lastSync?.LastSuccessRunTime || null;

    console.log("⏱ SQL LastSync:", lastSync);

    console.log(`last_sync_update_${subdbname}`, 89898);
    // 🔥 SEND SOCKET UPDATE
    io.emit(`last_sync_update_${subdbname}`, {
      subdbname,
      lastSyncTime,
      type: lastSync,
    });

    console.log("📡 LastSync Sent to frontend:", {
      subdbname,
      lastSyncTime,
    });

    return {
      subdbname,
      lastSyncTime,
      type: lastSync,
    };
  },
  { connection: redisConnection }
);

export { worker, lastSyncWorker };
