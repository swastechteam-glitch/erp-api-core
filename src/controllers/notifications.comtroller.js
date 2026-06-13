// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";
// import { io } from "../../index.js";

// export const getNotificationCount = async (req, res) => {
//   try {

//     if (!req.headers.subdbname) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing subDBName",
//       });
//     }

//     const pool = await getPool(req.headers.subdbname);

//     // Run all queries together
//     const result = await pool.request().query(`
//       -- Count notifications pending
//       SELECT COUNT(*) AS NotifyCount
//       FROM tbl_Notification
//       WHERE IsNotify = 0;

//       -- Count unread items (matching list condition)
//       SELECT COUNT(*) AS ReadCount
//       FROM tbl_Notification
//       WHERE IsRead = 0;

//       -- Actual data list
//       SELECT *
//       FROM tbl_Notification
//       ORDER BY CreatedAt DESC;
//     `);

//     // console.log(result.recordsets, "SQL Result------------------");

//     res.json({
//       success: true,
//       notifyCount: result.recordsets[0][0].NotifyCount,
//       readCount: result.recordsets[1][0].ReadCount,
//       data: result.recordsets[2],
//     });
//   } catch (err) {
//     console.error("SQL error", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getNotificationCountQueue = async (subdbname) => {
//   try {

//     if (!subdbname) {
//       return {
//         success: false,
//         message: "Missing subDBName",
//       };
//     }

//     const pool = await getPool(subdbname);

//     const result = await pool
//       .request()
//       .query(
//         "SELECT COUNT(*) AS UnreadCount FROM tbl_Notification WHERE IsNotify = 0"
//       );

//     return {
//       success: true,
//       count: result.recordset[0].UnreadCount,
//     };
//   } catch (err) {
//     console.error("SQL error", err);

//     return { success: false, error: err.message };
//   }
// };

// export const saveFCMToken = async (req, res) => {
//   const { fcmToken, platform } = req.body;
//   const subdbname = req.headers.subdbname;
//   const userId = req.headers.userId;
//   console.log(platform, 'platform 4342');

//   if (!fcmToken || !userId) {
//     return res.status(400).json({
//       error: "Missing fcmToken or userId",
//     });
//   }

//   try {
//     const pool = await getPool(subdbname);

//     // ✅ UPDATE by USER ID ONLY + Save both FCMToken and SubDBName
//     const result = await pool
//       .request()
//       .input("fcmToken", sql.NVarChar(2000), fcmToken)
//       .input("subdbname", sql.NVarChar(100), subdbname)
//       .input("platform", sql.NVarChar(100), platform)
//       .input("userId", sql.Int, userId) // Check USER ID only
//       .query(`
//         UPDATE tbl_User
//         SET FCMToken = @fcmToken,
//             SubDBName = @subdbname,
//             Platform = @platform
//         WHERE UserCode = @userId
//       `);

//     const affectedRows = result.rowsAffected[0];

//     if (affectedRows === 0) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     console.log(
//       `✅ FCM token + SubDB saved for UserID ${userId} (${affectedRows} row)`
//     );
//     res.json({ success: true, message: "Token saved", affectedRows });
//   } catch (err) {
//     console.error("Token save error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const notificationUpdate = async (req, res) => {
//   const { notificationID, isNotify, isRead, isApproved } = req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });
//     if (!Array.isArray(notificationID) || notificationID.length === 0)
//       return res
//         .status(400)
//         .json({ success: false, message: "notificationID must be array" });

//     const pool = await getPool(req.headers.subdbname);

//     // convert array to comma-separated string
//     const csvIDs = notificationID.join(",");

//     const request = pool.request();
//     if (!isRead) {
//       request.input("IsApproved", sql.Bit, isApproved);
//     }
//     await request
//       .input("NotificationIDs", sql.VarChar(sql.MAX), csvIDs)
//       .input("IsNotify", sql.Bit, isNotify)
//       .input("IsRead", sql.Bit, isRead)
//       .execute("web_sp_Notification_Update"); // use new SP

//     // Run all queries together
//     const result = await pool.request().query(`
//       SELECT COUNT(*) AS ReadCount
//       FROM tbl_Notification
//       WHERE IsRead = 0 AND IsNotify = 0;

//     `);

//     io.emit(`check_read_unread_${req.headers.subdbname}`, {
//       unReadCount: result?.recordset?.[0]?.ReadCount
//     });
//     return res
//       .status(201)
//       .json({ success: true, message: "Notifications updated successfully" });
//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const notificationsUpdate = async (
//   notificationID,
//   isNotify,
//   isRead,
//   isApproved,
//   subdbname
// ) => {
//   // const { notificationID, isNotify, isRead, isApproved } = req.body;

//   try {
//     if (!subdbname) return { success: false, message: "Missing subDBName" };

//     if (!Array.isArray(notificationID) || notificationID.length === 0)
//       return { success: false, message: "notificationID must be array" }

//     const pool = await getPool(subdbname);

//     // convert array to comma-separated string
//     const csvIDs = notificationID.join(",");

//     const request = pool.request();
//     await request
//       .input("NotificationIDs", sql.VarChar(sql.MAX), csvIDs)
//       .input("IsNotify", sql.Bit, isNotify)
//       // .input("IsRead", sql.Bit, isRead)
//       // .input("IsApproved", sql.Bit, isApproved)
//       .execute("web_sp_Notification_Update"); // use new SP

//     return { success: true, message: "Notifications updated successfully" };
//   } catch (err) {
//     return { success: false, error: err.message };
//   }
// };

// 5 functions

import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { io } from "../../index.js";
import { applyBranchCode } from "../utils/common.js";

// ✅ Helper to safely extract and apply BranchCode
// const applyBranchCode = (request, headers) => {
//   const bCode = headers["branchCode"] || headers["branchcode"];
//   const companyCode = headers["companyCode"] || headers["companyCode"];
//   console.log(companyCode, "companyCode 98799");

//   if (bCode) {
//     request.input("BranchCode", sql.Int, parseInt(bCode));
//   }
//   if (companyCode) {
//     request.input("CompanyCode", sql.Int, parseInt(companyCode));
//   }
// };

export const getNotificationCount = async (req, res) => {
  try {
    if (!req.headers.subdbname) {
      return res.status(400).json({
        success: false,
        message: "Missing subDBName",
      });
    }

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // ✅ Apply Branch Code
    let branchFilter = "";
    if (applyBranchCode(request, req.headers)) {
      branchFilter = " AND BranchCode = @BranchCode";
    }

    // Run all queries together with dynamic branch filtering
    const result = await request.query(`
      -- Count notifications pending
      SELECT COUNT(*) AS NotifyCount
      FROM tbl_Notification
      WHERE IsNotify = 0 ${branchFilter};

      -- Count unread items (matching list condition)
      SELECT COUNT(*) AS ReadCount
      FROM tbl_Notification
      WHERE IsRead = 0 ${branchFilter};

      -- Actual data list
      SELECT *
      FROM tbl_Notification
      WHERE 1=1 ${branchFilter}
      ORDER BY CreatedAt DESC;
    `);

    res.json({
      success: true,
      notifyCount: result.recordsets[0][0].NotifyCount,
      readCount: result.recordsets[1][0].ReadCount,
      data: result.recordsets[2],
    });
  } catch (err) {
    console.error("SQL error", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Added branchCode as an optional parameter
export const getNotificationCountQueue = async (
  subdbname,
  branchCode = null,
) => {
  try {
    if (!subdbname) {
      return {
        success: false,
        message: "Missing subDBName",
      };
    }

    const pool = await getPool(subdbname);
    const request = pool.request();

    let query =
      "SELECT COUNT(*) AS UnreadCount FROM tbl_Notification WHERE IsNotify = 0";

    if (branchCode) {
      request.input("BranchCode", sql.Int, parseInt(branchCode));
      query += " AND BranchCode = @BranchCode";
    }

    const result = await request.query(query);

    return {
      success: true,
      count: result.recordset[0].UnreadCount,
    };
  } catch (err) {
    console.error("SQL error", err);
    return { success: false, error: err.message };
  }
};

export const saveFCMToken = async (req, res) => {
  const { fcmToken, platform } = req.body;
  const subdbname = req.headers.subdbname;
  const userId = req.headers.userId;

  if (!fcmToken || !userId) {
    return res.status(400).json({
      error: "Missing fcmToken or userId",
    });
  }

  try {
    const pool = await getPool(subdbname);

    // Update FCM token (UserCode is unique, usually branch agnostic for login settings)
    const result = await pool
      .request()
      .input("fcmToken", sql.NVarChar(2000), fcmToken)
      .input("subdbname", sql.NVarChar(100), subdbname)
      .input("platform", sql.NVarChar(100), platform)
      .input("userId", sql.Int, userId).query(`
        UPDATE tbl_User 
        SET FCMToken = @fcmToken, 
            SubDBName = @subdbname,
            Platform = @platform
        WHERE UserCode = @userId 
      `);

    const affectedRows = result.rowsAffected[0];

    if (affectedRows === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ success: true, message: "Token saved", affectedRows });
  } catch (err) {
    console.error("Token save error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const notificationUpdate = async (req, res) => {
  const { notificationID, isNotify, isRead, isApproved } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });
    if (!Array.isArray(notificationID) || notificationID.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "notificationID must be array" });

    const pool = await getPool(req.headers.subdbname);

    // convert array to comma-separated string
    const csvIDs = notificationID.join(",");

    const request = pool.request();

    // ✅ Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    if (!isRead) {
      request.input("IsApproved", sql.Bit, isApproved);
    }
    if (request.parameters && request.parameters.CompanyCode) {
      delete request.parameters.CompanyCode;
    }
    await request
      .input("NotificationIDs", sql.VarChar(sql.MAX), csvIDs)
      .input("IsNotify", sql.Bit, isNotify)
      .input("IsRead", sql.Bit, isRead)
      .execute("web_sp_Notification_Update");

    // Run count query with branch filter
    const countReq = pool.request();
    let branchFilter = "";
    if (applyBranchCode(countReq, req.headers)) {
      branchFilter = " AND BranchCode = @BranchCode";
    }

    const result = await countReq.query(`
      SELECT COUNT(*) AS ReadCount
      FROM tbl_Notification
      WHERE IsRead = 0 AND IsNotify = 0 ${branchFilter};
    `);

    io.emit(`check_read_unread_${req.headers.subdbname}`, {
      unReadCount: result?.recordset?.[0]?.ReadCount,
    });

    return res
      .status(201)
      .json({ success: true, message: "Notifications updated successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ✅ Added branchCode as an optional parameter
export const notificationsUpdate = async (
  notificationID,
  isNotify,
  isRead,
  isApproved,
  subdbname,
  branchCode = null,
) => {
  try {
    if (!subdbname) return { success: false, message: "Missing subDBName" };

    if (!Array.isArray(notificationID) || notificationID.length === 0)
      return { success: false, message: "notificationID must be array" };

    const pool = await getPool(subdbname);

    const csvIDs = notificationID.join(",");

    const request = pool.request();

    // ✅ Apply optional BranchCode
    if (branchCode) {
      request.input("BranchCode", sql.Int, parseInt(branchCode));
    }
    if (request.parameters && request.parameters.CompanyCode) {
      delete request.parameters.CompanyCode;
    }

    await request
      .input("NotificationIDs", sql.VarChar(sql.MAX), csvIDs)
      .input("IsNotify", sql.Bit, isNotify)
      .execute("web_sp_Notification_Update");

    return { success: true, message: "Notifications updated successfully" };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
