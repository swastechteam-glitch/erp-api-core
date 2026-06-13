// // Event.js
// import { Queue, QueueEvents } from "bullmq";
// import sql from "mssql";
// import { Redis } from "ioredis";
// import dotenv from "dotenv";
// import { redisConfig } from "./redis.js";
// import { getPool } from "../config/dynamicDB.js";
// import { notificationsUpdate } from "../controllers/notifications.comtroller.js";
// // import { io } from "../../index.js";
// import admin from "firebase-admin";
// import { getNotificationCountQueue } from "./worker.js";
// import { getNotificationTokenList } from "./producer.js";

// dotenv.config();

// export function initQueueEvents(io) {
//   // Use SAME redis config everywhere
//   const connection = new Redis({
//     host: redisConfig.host,
//     port: redisConfig.port,
//     password: redisConfig.password,
//     maxRetriesPerRequest: null,
//     enableReadyCheck: false,
//   });

//   const connectionOptions = {
//     host: redisConfig.host,
//     port: redisConfig.port,
//     password: redisConfig.password,
//   };

//   // create a Queue instance so we can fetch job if needed
//   const notificationQueue = new Queue("notification-queue", {
//     connection: connectionOptions,
//   });

//   const queueEvents = new QueueEvents("notification-queue", {
//     connection: connectionOptions,
//   });

//   queueEvents.on("completed", async (payload) => {
//     try {
//       // payload shape: { jobId, returnvalue, prev, ... }
//       const { jobId, returnvalue } = payload;
//       const pool = await getPool(returnvalue?.subdbname);
//       // Get notifications
//       const notif = await getNotificationCountQueue(returnvalue?.subdbname);
//       console.log(notif, "notif -----------");

//       let title = "";
//       let message = "";
//       let link = "";
//       const companyCode = 1;
//       if (notif.count > 0) {
//         if (notif.count === 1) {
//           title = notif.data?.[0]?.ModuleName;
//           message = `${notif.data?.[0]?.SubModuleName} approval is pending, kindly check it❗`;
//           switch (notif.data?.[0]?.SubModuleName) {
//             case "Cotton Purchase Order Approval":
//               link = `/cotton-purchase-order-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Cotton Issue Lot Approval":
//               link = `/cotton-issue-lot-approval-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Cotton BillPassing Approval":
//               link = `/cotton-bill-passing-approval-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Cotton Allowance Approval":
//               link = `/allowance-generation-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Cotton Quality Test Approval":
//               link = `/cotton-quality-test-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Cotton Reject Lot Approval":
//               link = `/reject-lot-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Yarn Invoice Approval":
//               link = `/yarn-invoice-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Yarn Sales Order Approval":
//               link = `/yarn-sales-order-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Yarn Sales Return Approval":
//               link = `/sales-return-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Store Purchase Advice Approval":
//               link = `/purchase-advice-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Store Purchase Order Approval":
//               link = `/purchase-order-approve1-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Store Purchase Order Approval - GM":
//               link = `/purchase-order-approve-gm-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Store Purchase Order Approval - MD":
//               link = `/purchase-order-approve-md-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Store Bill Passing Approval":
//               link = `/bill-passing-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Store Goods In Approval":
//               link = `/goods-in-approval-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Store Goods Out Approval 1":
//               link = `/goods-out-approval-one-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Store Goods Out Approval 2":
//               link = `/goods-out-approval-two-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Employee Approval":
//               link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Attendance Manual Entry Approval":
//               link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Employee Wise Increment Approval":
//               link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Grade Wise Increment Approval":
//               link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Onduty Approval":
//               link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Leave Approval":
//               link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Compensation Approval":
//               link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Gate Goods Out Approval":
//               link = `/goods-out-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Gate Vehicle In-Out Approval":
//               link = `/vehicle-in-out-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Finance Receipt Approval 1":
//               link = `/finance-receipt-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Finance Receipt Approval 2":
//               link = `/finance-receipt-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Finance Advance Request Approval 1":
//               link = `/adv-payment-approve-one-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Finance Advance Request Approval 2":
//               link = `/adv-payment-approve-two-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Finance Payment Approval":
//               link = `/payment-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Finance Credit Note Approval":
//               link = `/credit-note-details-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             case "Finance Debit Note Approval":
//               link = `/debit-note-details-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
//               break;
//             default:
//               link = "/notification-list";
//           }
//         } else {
//           title = "Pending Request";
//           message = `You have ${notif.count} new approval pendings❗`;
//           link = "/notification-list";
//         }
//         console.log(link, "link ---------------");

//         // Emit Socket.IO event
//         io.emit(`check_emit_${returnvalue?.userId}_${returnvalue?.subdbname}`, {
//           id: jobId,
//           title,
//           message,
//           link,
//           jobData: { ...returnvalue },
//         });
//         console.log("Socket emitted ✔");
//         // const baseMessage = {
//         //   token: fcmToken,
//         //   data: {
//         //     title: String(title),
//         //     body: String(message),
//         //     jobId: String(jobId),
//         //     link: link,
//         //     tag: "TEXTILE_ERP", // 🔒 SAME TAG
//         //   },
//         // };
//         const token = await getNotificationTokenList(
//           returnvalue?.subdbname,
//           returnvalue?.userId,
//           1
//         );
//         console.log(token, "token 888888888888888");

//         // Send FCM notification
//         if (token?.totalRecords > 0) {
//           try {
//             // if (platform === "web") {
//             //   const uniqueKey = `job_${jobId}`;
//             //   console.log("web", uniqueKey, 1.112244);
//             //   await admin.messaging().send({
//             //     token: fcmToken,
//             //     data: {
//             //       title,
//             //       body: message,
//             //       link,
//             //       jobId: String(jobId),
//             //       click_action: String(link),
//             //       unique: String(uniqueKey),
//             //     },
//             //   });
//             // }

//             // // 🤖 ANDROID APP

//             // if (platform === "android") {
//             //   const uniqueKey = `job_${jobId}`;
//             //   await admin.messaging().send({
//             //     token: fcmToken,

//             //     // notification: {
//             //     //   title,
//             //     //   body: message,
//             //     // },

//             //     android: {
//             //       priority: "high",
//             //       collapseKey: "TEXTILE_ERP",
//             //     },

//             //     data: {
//             //       title,
//             //       body: message,
//             //       link,
//             //       jobId: String(jobId),
//             //       click_action: String(link),
//             //       unique: String(uniqueKey),
//             //     },
//             //   });
//             // }

//             // // 🍎 iOS APP
//             // if (platform === "ios") {
//             //   const uniqueKey = `job_${jobId}`;
//             //   console.log("IOS", 1.13);
//             //   await admin.messaging().send({
//             //     token: fcmToken,
//             //     apns: {
//             //       payload: {
//             //         aps: {
//             //           alert: { title, body: message },
//             //           sound: "default",
//             //           "thread-id": String(uniqueKey),
//             //         },
//             //       },
//             //     },
//             //     data: {
//             //       link,
//             //       jobId: String(jobId),
//             //       unique: String(uniqueKey),
//             //     },
//             //   });
//             // }

//             for (const tk of token?.data) {
//               const payload = {
//                 token: tk.Token,
//                 data: {
//                   title: String(title),
//                   body: String(message),
//                   link: String(link),
//                   jobId: String(jobId),
//                   unique: `job_${jobId}`,
//                   click_action: "FLUTTER_NOTIFICATION_CLICK",
//                 },
//               };

//               console.log(tk, payload, "tk ----------");

//               if (tk.platform === "web") {
//                 const res = await admin.messaging().send(payload);
//                 console.log(res, "web res");
//               }

//               if (tk.Platform === "android") {
//                 const res = await admin.messaging().send({
//                   ...payload,
//                   android: { priority: "high" },
//                 });
//                 console.log(res, "android res");
//               }

//               if (tk.Platform === "ios") {
//                 const res = await admin.messaging().send({
//                   ...payload,
//                   apns: {
//                     payload: {
//                       aps: {
//                         "content-available": 1,
//                       },
//                     },
//                   },
//                 });
//                 console.log(res, "ios res");
//               }
//             }

//             let notificationID = [];
//             notif?.data?.map((data) => {
//               notificationID.push(data?.NotificationID);
//             });
//             console.log(notificationID, "notificationID--------");

//             await notificationsUpdate(
//               notificationID,
//               true,
//               false,
//               false,
//               returnvalue?.subdbname
//             );
//             // const response = await admin.messaging().send(fcmMessage);
//             // console.log("✅ FCM sent successfully:", response);
//             console.log("📩 Notification sent ✔");
//           } catch (err) {
//             console.error("FCM ERROR:", err);
//             if (
//               err?.errorInfo?.code ===
//               "messaging/registration-token-not-registered"
//             ) {
//               await pool.request().query(`
//                   UPDATE tbl_User SET FCMToken = 1
//                   WHERE UserCode = '${returnvalue?.userId}'
//                 `);
//               io.emit(`invalidate_token_${returnvalue?.userId}`, {
//                 remove: true,
//               });
//             }
//           }
//         } else {
//           console.log("⚠ No FCM token");
//         }
//       }
//     } catch (err) {
//       console.error("Error handling completed event:", err);
//     }
//   });
//   queueEvents.on("failed", ({ jobId, failedReason }) => {
//     console.log(`❌ Repeat Job Failed: ${jobId}`, failedReason);
//   });

//   queueEvents.on("error", (err) => {
//     console.error("🚨 QueueEvents Error:", err);
//   });

//   // Events for LastSync Queue
//   const syncEvents = new QueueEvents("last-sync-queue", { connection });

//   syncEvents.on("completed", (job, result) => {
//     console.log("last sync update data", result, job);

//     io.emit(`last_sync_update_${job?.returnvalue?.subdbname}`, {
//       subdbname: job?.returnvalue?.subdbname,
//       lastSyncTime: job?.returnvalue?.lastSyncTime,
//       type: "lastSync",
//     });
//     console.log("last_sync_update notification send ✔");
//     console.log(`⏱ LastSync Job Executed: ${job.jobId}`);
//   });

//   syncEvents.on("failed", ({ jobId, failedReason }) =>
//     console.log(`❌ LastSync Job Failed: ${jobId}`, failedReason)
//   );
// }



// Event.js
import { Queue, QueueEvents } from "bullmq";
import sql from "mssql";
import { Redis } from "ioredis";
import dotenv from "dotenv";
import { redisConfig } from "./redis.js";
import { getPool } from "../config/dynamicDB.js";
import { notificationsUpdate } from "../controllers/notifications.comtroller.js";
// import { io } from "../../index.js";
import admin from "firebase-admin";
import { getNotificationCountQueue } from "./worker.js";
import { getNotificationTokenList } from "./producer.js";

dotenv.config();

export function initQueueEvents(io) {
  // Use SAME redis config everywhere
  const connection = new Redis({
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const connectionOptions = {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
  };

  // create a Queue instance so we can fetch job if needed
  const notificationQueue = new Queue("notification-queue", {
    connection: connectionOptions,
  });

  const queueEvents = new QueueEvents("notification-queue", {
    connection: connectionOptions,
  });

  queueEvents.on("completed", async (payload) => {
    try {
      // payload shape: { jobId, returnvalue, prev, ... }
      const { jobId, returnvalue } = payload;
      const pool = await getPool(returnvalue?.subdbname);
      // Get notifications
      const notif = await getNotificationCountQueue(returnvalue?.subdbname);
      // console.log(notif, "notif -----------");

      let title = "";
      let message = "";
      let link = "";
      const companyCode = 1;
      
      if (notif.count > 0) {
        if (notif.count === 1) {
          title = notif.data?.[0]?.ModuleName;
          message = `${notif.data?.[0]?.SubModuleName} approval is pending, kindly check it❗`;
          switch (notif.data?.[0]?.SubModuleName) {
            case "Cotton Purchase Order Approval":
              link = `/cotton-purchase-order-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Cotton Issue Lot Approval":
              link = `/cotton-issue-lot-approval-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Cotton BillPassing Approval":
              link = `/cotton-bill-passing-approval-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Cotton Allowance Approval":
              link = `/allowance-generation-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Cotton Quality Test Approval":
              link = `/cotton-quality-test-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Cotton Reject Lot Approval":
              link = `/reject-lot-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Yarn Invoice Approval":
              link = `/yarn-invoice-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Yarn Sales Order Approval":
              link = `/yarn-sales-order-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Yarn Sales Return Approval":
              link = `/sales-return-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Store Purchase Advice Approval":
              link = `/purchase-advice-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Store Purchase Order Approval":
              link = `/purchase-order-approve1-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Store Purchase Order Approval - GM":
              link = `/purchase-order-approve-gm-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Store Purchase Order Approval - MD":
              link = `/purchase-order-approve-md-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Store Bill Passing Approval":
              link = `/bill-passing-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Store Goods In Approval":
              link = `/goods-in-approval-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Store Goods Out Approval 1":
              link = `/goods-out-approval-one-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Store Goods Out Approval 2":
              link = `/goods-out-approval-two-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Employee Approval":
              link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Attendance Manual Entry Approval":
              link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Employee Wise Increment Approval":
              link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Grade Wise Increment Approval":
              link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Onduty Approval":
              link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Leave Approval":
              link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Compensation Approval":
              link = `/hrm-employee-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Gate Goods Out Approval":
              link = `/goods-out-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Gate Vehicle In-Out Approval":
              link = `/vehicle-in-out-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Finance Receipt Approval 1":
              link = `/finance-receipt-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Finance Receipt Approval 2":
              link = `/finance-receipt-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Finance Advance Request Approval 1":
              link = `/adv-payment-approve-one-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Finance Advance Request Approval 2":
              link = `/adv-payment-approve-two-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Finance Payment Approval":
              link = `/payment-approve-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Finance Credit Note Approval":
              link = `/credit-note-details-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            case "Finance Debit Note Approval":
              link = `/debit-note-details-overview/${notif.data?.[0]?.ApprovalID}/${companyCode}`;
              break;
            default:
              link = "/notification-list";
          }
        } else {
          title = "Pending Request";
          message = `You have ${notif.count} new approval pendings❗`;
          link = "/notification-list";
        }
        
        // console.log(link, "link ---------------");

        // Emit Socket.IO event
        io.emit(`check_emit_${returnvalue?.userId}_${returnvalue?.subdbname}`, {
          id: jobId,
          title,
          message,
          link,
          jobData: { ...returnvalue },
        });
        // console.log("Socket emitted ✔");

        const token = await getNotificationTokenList(
          returnvalue?.subdbname,
          returnvalue?.userId,
          1
        );
        // console.log(token, "token 888888888888888");

        // Send FCM notification
        if (token?.totalRecords > 0) {
          for (const tk of token?.data) {
            // Safely handle casing differences between web and mobile platforms
            const platformStr = (tk.platform || tk.Platform)?.toLowerCase();

            const fcmPayload = {
              token: tk.Token,
              data: {
                title: String(title),
                body: String(message),
                link: String(link),
                jobId: String(jobId),
                unique: `job_${jobId}`,
                click_action: "FLUTTER_NOTIFICATION_CLICK",
              },
            };

            // console.log(tk, fcmPayload, "tk ----------");

            // INNER TRY-CATCH: If one token fails, it won't crash the loop
            try {
              if (platformStr === "web") {
                const res = await admin.messaging().send(fcmPayload);
                // console.log(res, "web res");
              }

              if (platformStr === "android") {
                const res = await admin.messaging().send({
                  ...fcmPayload,
                  android: { priority: "high" },
                });
                // console.log(res, "android res");
              }

              if (platformStr === "ios") {
                const res = await admin.messaging().send({
                  ...fcmPayload,
                  apns: {
                    payload: {
                      aps: {
                        "content-available": 1,
                      },
                    },
                  },
                });
                // console.log(res, "ios res");
              }
            } catch (err) {
              console.error(`FCM ERROR for token ${tk.Token}:`, err?.errorInfo?.code || err.message);
              
              if (err?.errorInfo?.code === "messaging/registration-token-not-registered") {
                // Invalidate user FCM token in DB
                await pool.request().query(`
                  UPDATE tbl_User SET FCMToken = 1
                  WHERE UserCode = '${returnvalue?.userId}'
                `);
                
                io.emit(`invalidate_token_${returnvalue?.userId}`, {
                  remove: true,
                });
                console.log(`Removed unregistered token for user ${returnvalue?.userId}`);
              }
            }
          } // End of token loop

          // Update Notification records in DB after processing tokens
          try {
            let notificationID = [];
            notif?.data?.map((data) => {
              notificationID.push(data?.NotificationID);
            });
            // console.log(notificationID, "notificationID--------");

            if (notificationID.length > 0) {
              await notificationsUpdate(
                notificationID,
                true,
                false,
                false,
                returnvalue?.subdbname
              );
            }
            console.log("📩 Notification sent and DB updated ✔");
          } catch (dbErr) {
            console.error("Error updating notifications in DB:", dbErr);
          }
          
        } else {
          console.log("⚠ No FCM token");
        }
      }
    } catch (err) {
      console.error("Error handling completed event:", err);
    }
  });

  queueEvents.on("failed", ({ jobId, failedReason }) => {
    console.log(`❌ Repeat Job Failed: ${jobId}`, failedReason);
  });

  queueEvents.on("error", (err) => {
    console.error("🚨 QueueEvents Error:", err);
  });

  // Events for LastSync Queue
  const syncEvents = new QueueEvents("last-sync-queue", { connection });

  syncEvents.on("completed", (job, result) => {
    // console.log("last sync update data", result, job);

    io.emit(`last_sync_update_${job?.returnvalue?.subdbname}`, {
      subdbname: job?.returnvalue?.subdbname,
      lastSyncTime: job?.returnvalue?.lastSyncTime,
      type: "lastSync",
    });
    console.log("last_sync_update notification send ✔");
    console.log(`⏱ LastSync Job Executed: ${job.jobId}`);
  });

  syncEvents.on("failed", ({ jobId, failedReason }) =>
    console.log(`❌ LastSync Job Failed: ${jobId}`, failedReason)
  );
}