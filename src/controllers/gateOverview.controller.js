// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";
// import { getFilterCurrentDate, getNetworkTime } from "../utils/common.js";

// export const vehicleInOutApproval = async (req, res) => {
//   let transaction;

//   try {
//     if (!req.headers.subdbname) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing subDBName",
//       });
//     }

//     const pool = await getPool(req.headers.subdbname);

//     const payload = req.body;

//     const companyCodeRaw =
//       req.headers.companycode ||
//       req.headers.companyCode ||
//       payload.companyCode ||
//       payload.companycode;

//     const companyCode = Number(companyCodeRaw);
//     const nodeCode = req.headers.nodecode || req.headers.nodeCode;
//     const userId = req.headers.userid || req.headers.userId;

//     if (!payload.id || !companyCode) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required parameters",
//       });
//     }

//     /* ================= TRANSACTION ================= */
//     transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     /* ================= APPROVAL ================= */
//     const reqTxn = new sql.Request(transaction);
//     reqTxn.input("VehicleInOutPassCode", sql.Int, payload.id);
//     reqTxn.input("CompanyCode", sql.Int, companyCode);
//     reqTxn.input("UserCode", sql.Int, userId);
//     reqTxn.input("NodeCode", sql.Int, nodeCode);

//     const result = await reqTxn.execute(
//       "sp_GateEntryVehicleInOut_Approval"
//     );

//     /* ================= NOTIFICATION ================= */
//     await new sql.Request(transaction)
//       .input("ApprovalID", sql.Int, payload.id)
//       .input("IsNotify", sql.Bit, 1)
//       .input("IsRead", sql.Bit, 1)
//       .input("IsApproved", sql.Bit, 1)
//       .input("ModuleName", sql.NVarChar, "GATE")
//       .input("subModuleName", sql.NVarChar, "Gate Vehicle In-Out Approval")
//       .execute("web_sp_Notification_Update");

//     await transaction.commit();

//     /* ================= DASHBOARD (NON-TXN) ================= */
//     const postRequest = pool.request();
//     postRequest.input("CompanyCode", sql.Int, companyCode);

//     await postRequest.query(`
//       UPDATE tbl_DashBoard
//       SET Gate_VehicleInOut_ApprovalPendings = (
//         SELECT ISNULL(COUNT(VehicleInOutPassCode), 0)
//         FROM vw_GateEntryVehicleInOut
//         WHERE CompanyCode = @CompanyCode
//           AND Approval = 0
//       )
//       WHERE DashBoardCode = 1
//     `);

//     return res.status(200).json({
//       success: true,
//       data: result.recordset || [],
//       message: "Vehicle In/Out Approved Successfully!",
//     });

//   } catch (err) {
//     if (transaction) {
//       try {
//         await transaction.rollback();
//       } catch (_) {
//         // ignore rollback errors
//       }
//     }

//     console.error("VehicleInOutApproval Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: err.message || "Vehicle In/Out Approval failed",
//     });
//   }
// };

// // Get List

// export const gateOutApproval = async (req, res) => {
//   let transaction;

//   try {
//     if (!req.headers.subdbname)
//       return res.status(400).json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     const payload = req.body;
//     const companyCode = payload.companyCode;

//     transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     const date = getFilterCurrentDate();
//     const time = await getNetworkTime();

//     /* ================= UPDATE GATE OUT ================= */
//     const gateReq = new sql.Request(transaction);
//     gateReq.input("CompanyCode", sql.Int, companyCode);
//     gateReq.input("GoodsOutPassCode", sql.Int, payload.id);
//     gateReq.input("GateOutDate", sql.VarChar, date);
//     gateReq.input("OutTime", sql.VarChar, time);

//     await gateReq.query(`
//       UPDATE tbl_GateEntryGoodsOut
//       SET GateOutDate = @GateOutDate,
//           OutTime = @OutTime
//       WHERE CompanyCode = @CompanyCode
//         AND GoodsOutPassCode = @GoodsOutPassCode
//     `);

//     /* ================= NOTIFICATION ================= */
//     await new sql.Request(transaction)
//       .input("ApprovalID", sql.Int, payload.id)
//       .input("IsNotify", sql.Bit, 1)
//       .input("IsRead", sql.Bit, 1)
//       .input("IsApproved", sql.Bit, 1)
//       .input("ModuleName", sql.NVarChar, "GATE")
//       .input("subModuleName", sql.NVarChar, "Gate Goods Out Approval")
//       .execute("web_sp_Notification_Update");

//     await transaction.commit();

//     return res.status(200).json({
//       success: true,
//       message: "Gate Out Approved Successfully!",
//     });

//   } catch (err) {
//     if (transaction) {
//       try { await transaction.rollback(); } catch (_) {}
//     }

//     console.error("GateOut Approval Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: err.message || "Gate Out Approval failed",
//     });
//   }
// };

// export const getGoodsOutPassApproveOverview = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const paramId = req.params;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let mainResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("GoodsOutPassCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_GateEntryGoodsOut_GetAll");

//     let detailedResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("GoodsOutPassCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_GateEntryGoodsOutDetails_GetAll");

//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       id: mainResult?.recordsets?.[0]?.[0]?.GoodsOutPassCode,
//     });
//     // Apply pagination manually
//     const paginatedData = detailedResult?.recordset?.slice(
//       offset,
//       offset + pageSize
//     );
//     const outputData = {
//       mainOutput: addId,
//       detailedOutput: paginatedData,
//     };
//     res.status(200).json({
//       totalRecords: detailedResult?.recordset.length,
//       currentPage: page,
//       pageSize: pageSize,
//       totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
//       data: outputData,
//     });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getVehicleInOutApproveOverview = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const paramId = req.params;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let mainResult = await pool
//       .request()
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("VehicleInOutPassCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_GateEntryVehicleInOut_GetAll");

//     const totalRecords = mainResult?.recordset?.length || 0;
//     const addId = Object.assign({
//       ...mainResult.recordset?.[0],
//       id: mainResult.recordset?.[0]?.VehicleInOutPassCode,
//     });

//     res.status(200).json({
//       totalRecords,
//       currentPage: page,
//       pageSize,
//       totalPages: Math.ceil(totalRecords / pageSize),
//       data: addId,
//     });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { applyBranchCode, getFilterCurrentDate, getNetworkTime } from "../utils/common.js";

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

export const vehicleInOutApproval = async (req, res) => {
  let transaction;

  try {
    if (!req.headers.subdbname) {
      return res.status(400).json({
        success: false,
        message: "Missing subDBName",
      });
    }

    const pool = await getPool(req.headers.subdbname);

    const payload = req.body;

    const companyCodeRaw =
      req.headers.companycode ||
      req.headers.companyCode ||
      payload.companyCode ||
      payload.companycode;

    const companyCode = Number(companyCodeRaw);
    const nodeCode = req.headers.nodecode || req.headers.nodeCode;
    const userId = req.headers.userid || req.headers.userId;

    if (!payload.id || !companyCode) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters",
      });
    }

    /* ================= TRANSACTION ================= */
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    /* ================= APPROVAL ================= */
    const reqTxn = new sql.Request(transaction);
    applyBranchCode(reqTxn, req.headers); // 👈 Fix applied

    reqTxn.input("VehicleInOutPassCode", sql.Int, payload.id);
    // reqTxn.input("CompanyCode", sql.Int, companyCode);
    reqTxn.input("UserCode", sql.Int, userId);
    reqTxn.input("NodeCode", sql.Int, nodeCode);

    const result = await reqTxn.execute("sp_GateEntryVehicleInOut_Approval");

    /* ================= NOTIFICATION ================= */
    const notifyReq = new sql.Request(transaction);
    applyBranchCode(notifyReq, req.headers); // 👈 Fix applied
    if (notifyReq.parameters && notifyReq.parameters.CompanyCode) {
      delete notifyReq.parameters.CompanyCode;
    }
    await notifyReq
      .input("ApprovalID", sql.Int, payload.id)
      .input("IsNotify", sql.Bit, 1)
      .input("IsRead", sql.Bit, 1)
      .input("IsApproved", sql.Bit, 1)
      .input("ModuleName", sql.NVarChar, "GATE")
      .input("subModuleName", sql.NVarChar, "Gate Vehicle In-Out Approval")
      .execute("web_sp_Notification_Update");

    await transaction.commit();

    /* ================= DASHBOARD (NON-TXN) ================= */
    const postRequest = pool.request();
    let branchFilter = "";

    // Check and apply branch code for dashboard query
    if (applyBranchCode(postRequest, req.headers)) {
      branchFilter = " AND BranchCode = @BranchCode";
    }

    postRequest.input("CompanyCode", sql.Int, companyCode);

    await postRequest.query(`
      UPDATE tbl_DashBoard
      SET Gate_VehicleInOut_ApprovalPendings = (
        SELECT ISNULL(COUNT(VehicleInOutPassCode), 0)
        FROM vw_GateEntryVehicleInOut
        WHERE CompanyCode = @CompanyCode
          AND Approval = 0
          ${branchFilter}
      )
      WHERE DashBoardCode = 1
    `);

    return res.status(200).json({
      success: true,
      data: result.recordset || [],
      message: "Vehicle In/Out Approved Successfully!",
    });
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {
        // ignore rollback errors
      }
    }

    console.error("VehicleInOutApproval Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Vehicle In/Out Approval failed",
    });
  }
};

// Get List

export const gateOutApproval = async (req, res) => {
  let transaction;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    const payload = req.body;
    const companyCode = payload.companyCode;

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const date = getFilterCurrentDate();
    const time = await getNetworkTime();

    /* ================= UPDATE GATE OUT ================= */
    const gateReq = new sql.Request(transaction);
    applyBranchCode(gateReq, req.headers); // 👈 Fix applied

    // gateReq.input("CompanyCode", sql.Int, companyCode);
    gateReq.input("GoodsOutPassCode", sql.Int, payload.id);
    gateReq.input("GateOutDate", sql.VarChar, date);
    gateReq.input("OutTime", sql.VarChar, time);

    await gateReq.query(`
      UPDATE tbl_GateEntryGoodsOut 
      SET GateOutDate = @GateOutDate,
          OutTime = @OutTime
      WHERE CompanyCode = @CompanyCode
        AND GoodsOutPassCode = @GoodsOutPassCode
    `);

    /* ================= NOTIFICATION ================= */
    const notifyReq = new sql.Request(transaction);
    applyBranchCode(notifyReq, req.headers); // 👈 Fix applied
    if (notifyReq.parameters && notifyReq.parameters.CompanyCode) {
      delete notifyReq.parameters.CompanyCode;
    }
    await notifyReq
      .input("ApprovalID", sql.Int, payload.id)
      .input("IsNotify", sql.Bit, 1)
      .input("IsRead", sql.Bit, 1)
      .input("IsApproved", sql.Bit, 1)
      .input("ModuleName", sql.NVarChar, "GATE")
      .input("subModuleName", sql.NVarChar, "Gate Goods Out Approval")
      .execute("web_sp_Notification_Update");

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Gate Out Approved Successfully!",
    });
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {}
    }

    console.error("GateOut Approval Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Gate Out Approval failed",
    });
  }
};

export const getGoodsOutPassApproveOverview = async (req, res) => {
  try {
    const paramData = req.query;
    const paramId = req.params;

    // Extract pagination params with defaults
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    // Connect to the database
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    // Execute the stored procedure
    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("GoodsOutPassCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_GateEntryGoodsOut_GetAll");

    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("GoodsOutPassCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_GateEntryGoodsOutDetails_GetAll");

    const addId = Object.assign({
      ...mainResult?.recordsets?.[0]?.[0],
      id: mainResult?.recordsets?.[0]?.[0]?.GoodsOutPassCode,
    });
    // Apply pagination manually
    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + pageSize,
    );
    const outputData = {
      mainOutput: addId,
      detailedOutput: paginatedData,
    };
    res.status(200).json({
      totalRecords: detailedResult?.recordset.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
      data: outputData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getVehicleInOutApproveOverview = async (req, res) => {
  try {
    const paramData = req.query;
    const paramId = req.params;

    // Extract pagination params with defaults
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;

    // Connect to the database
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    applyBranchCode(request, req.headers); // 👈 Fix applied

    // Execute the stored procedure
    let mainResult = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("VehicleInOutPassCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_GateEntryVehicleInOut_GetAll");

    const totalRecords = mainResult?.recordset?.length || 0;
    const addId = Object.assign({
      ...mainResult.recordset?.[0],
      id: mainResult.recordset?.[0]?.VehicleInOutPassCode,
    });

    res.status(200).json({
      totalRecords,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(totalRecords / pageSize),
      data: addId,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};
