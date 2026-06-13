// // import { sql, poolPromise } from "../config/db.js";
// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const getReceipt1Approval = async (req, res) => {
//   try {
//     const paramData = req.query;

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
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_ReceiptAppoval_GetPendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.ReceiptCode });
//       return addId;
//     });
//     // Apply pagination manually
//     const paginatedData = results.slice(offset, offset + pageSize);

//     res.status(200).json({
//       totalRecords: data.length,
//       currentPage: page,
//       pageSize: pageSize,
//       totalPages: Math.ceil(data.length / pageSize),
//       data: paginatedData,
//     });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getReceipt2Approval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_ReceiptAppoval_Final_GetPendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({
//         ...item,
//         id: Array.isArray(item.ReceiptCode) ? item.ReceiptCode?.[0] : "",
//       });
//       return addId;
//     });
//     // Apply pagination manually
//     const paginatedData = results.slice(offset, offset + pageSize);

//     res.status(200).json({
//       totalRecords: data.length,
//       currentPage: page,
//       pageSize: pageSize,
//       totalPages: Math.ceil(data.length / pageSize),
//       data: paginatedData,
//     });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getAdvReq1Approval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("Cotton", sql.Int, parseInt(paramData?.cotton))
//       .input("Stores", sql.Int, parseInt(paramData?.stores))
//       .input("Cotton_Freight", sql.Int, parseInt(paramData?.cottonFreight))
//       .input(
//         "Transport_Freight",
//         sql.Int,
//         parseInt(paramData?.transportFreight)
//       )
//       .input(
//         "YARN_AGENT_COMMISSION",
//         sql.Int,
//         parseInt(paramData?.yarnAgentCommission)
//       )
//       .input("SERVICE_ORDER", sql.Int, parseInt(paramData?.serviceOrder))
//       .execute("web_sp_AdvanceRequisitionApproval_Stage1_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.AdvanceRequisitionCode });
//       return addId;
//     });
//     // Apply pagination manually
//     const paginatedData = results.slice(offset, offset + pageSize);

//     res.status(200).json({
//       totalRecords: data.length,
//       currentPage: page,
//       pageSize: pageSize,
//       totalPages: Math.ceil(data.length / pageSize),
//       data: paginatedData,
//     });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getAdvReq2Approval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("Cotton", sql.Int, parseInt(paramData?.cotton))
//       .input("Stores", sql.Int, parseInt(paramData?.stores))
//       .input("Cotton_Freight", sql.Int, parseInt(paramData?.cottonFreight))
//       .input(
//         "Transport_Freight",
//         sql.Int,
//         parseInt(paramData?.transportFreight)
//       )
//       .input(
//         "YARN_AGENT_COMMISSION",
//         sql.Int,
//         parseInt(paramData?.yarnAgentCommission)
//       )
//       .input("SERVICE_ORDER", sql.Int, parseInt(paramData?.serviceOrder))
//       .execute("web_sp_AdvanceRequisitionApproval_Stage2_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.AdvanceRequisitionCode });
//       return addId;
//     });
//     // Apply pagination manually
//     const paginatedData = results.slice(offset, offset + pageSize);

//     res.status(200).json({
//       totalRecords: data.length,
//       currentPage: page,
//       pageSize: pageSize,
//       totalPages: Math.ceil(data.length / pageSize),
//       data: paginatedData,
//     });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getPaymentApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("Cotton", sql.Int, parseInt(paramData?.cotton))
//       .input("Stores", sql.Int, parseInt(paramData?.stores))
//       .input("Cotton_Freight", sql.Int, parseInt(paramData?.cottonFreight))
//       .input(
//         "Transport_Freight",
//         sql.Int,
//         parseInt(paramData?.transportFreight)
//       )
//       .input(
//         "YARN_AGENT_COMMISSION",
//         sql.Int,
//         parseInt(paramData?.yarnAgentCommission)
//       )
//       .input("SERVICE_ORDER", sql.Int, parseInt(paramData?.serviceOrder))
//       .input(
//         "LABOUR_AGENT_COMMISSION",
//         sql.Int,
//         parseInt(paramData?.labourAgentCommission)
//       )
//       .input("YARN_PURCHASE", sql.Int, parseInt(paramData?.yarnPurchase))
//       .execute("web_sp_PaymentAppoval_GetPendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.PaymentCode });
//       return addId;
//     });
//     // Apply pagination manually
//     const paginatedData = results.slice(offset, offset + pageSize);

//     res.status(200).json({
//       totalRecords: data.length,
//       currentPage: page,
//       pageSize: pageSize,
//       totalPages: Math.ceil(data.length / pageSize),
//       data: paginatedData,
//     });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getCreditNoteApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_CreditNoteAppoval_GetPendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.CreditNoteCode });
//       return addId;
//     });
//     // Apply pagination manually
//     const paginatedData = results.slice(offset, offset + pageSize);

//     res.status(200).json({
//       totalRecords: data.length,
//       currentPage: page,
//       pageSize: pageSize,
//       totalPages: Math.ceil(data.length / pageSize),
//       data: paginatedData,
//     });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getDebitNoteApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("Cotton", sql.Int, parseInt(paramData?.cotton))
//       .input("Stores", sql.Int, parseInt(paramData?.stores))
//       .input("Cotton_Freight", sql.Int, parseInt(paramData?.cottonFreight))
//       .input(
//         "Transport_Freight",
//         sql.Int,
//         parseInt(paramData?.transportFreight)
//       )
//       .input(
//         "yarnAgentCommission",
//         sql.Int,
//         parseInt(paramData?.yarnAgentCommission)
//       )
//       .input("ServiceOrder", sql.Int, parseInt(paramData?.serviceOrder))

//       .execute("web_sp_DebitNoteAppoval_GetPendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.DebitNoteCode });
//       return addId;
//     });
//     // Apply pagination manually
//     const paginatedData = results.slice(offset, offset + pageSize);

//     res.status(200).json({
//       totalRecords: data.length,
//       currentPage: page,
//       pageSize: pageSize,
//       totalPages: Math.ceil(data.length / pageSize),
//       data: paginatedData,
//     });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };


// 7 functions


import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { applyBranchCode } from "../utils/common.js";

// ✅ Helper to safely extract and apply BranchCode
// const applyBranchCode = (request, headers) => {
//   const bCode = headers["branchCode"] || headers["branchcode"];
//   const companyCode = headers["companyCode"] || headers["companyCode"];
//   console.log(companyCode, 'companyCode 98799');
  
//   if (bCode) {
//     request.input("BranchCode", sql.Int, parseInt(bCode));
//   }
//   if (companyCode) {
//     request.input("CompanyCode", sql.Int, parseInt(companyCode));
//   }
// };
export const getReceipt1Approval = async (req, res) => {
  try {
    const paramData = req.query;

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
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    // Execute the stored procedure
    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_ReceiptAppoval_GetPendings");

    const data = result.recordset;
    let results = data.map((item) => {
      const addId = Object.assign({ ...item, id: item.ReceiptCode });
      return addId;
    });
    // Apply pagination manually
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getReceipt2Approval = async (req, res) => {
  try {
    const paramData = req.query;

    // Extract pagination params with defaults
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    // Execute the stored procedure
    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_ReceiptAppoval_Final_GetPendings");

    const data = result.recordset;
    let results = data.map((item) => {
      const addId = Object.assign({
        ...item,
        id: Array.isArray(item.ReceiptCode) ? item.ReceiptCode?.[0] : "",
      });
      return addId;
    });
    // Apply pagination manually
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getAdvReq1Approval = async (req, res) => {
  try {
    const paramData = req.query;

    // Extract pagination params with defaults
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    // Execute the stored procedure
    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("Cotton", sql.Int, parseInt(paramData?.cotton))
      .input("Stores", sql.Int, parseInt(paramData?.stores))
      .input("Cotton_Freight", sql.Int, parseInt(paramData?.cottonFreight))
      .input(
        "Transport_Freight",
        sql.Int,
        parseInt(paramData?.transportFreight)
      )
      .input(
        "YARN_AGENT_COMMISSION",
        sql.Int,
        parseInt(paramData?.yarnAgentCommission)
      )
      .input("SERVICE_ORDER", sql.Int, parseInt(paramData?.serviceOrder))
      .execute("web_sp_AdvanceRequisitionApproval_Stage1_Pending");

    const data = result.recordset;
    let results = data.map((item) => {
      const addId = Object.assign({ ...item, id: item.AdvanceRequisitionCode });
      return addId;
    });
    // Apply pagination manually
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getAdvReq2Approval = async (req, res) => {
  try {
    const paramData = req.query;

    // Extract pagination params with defaults
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    // Execute the stored procedure
    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("Cotton", sql.Int, parseInt(paramData?.cotton))
      .input("Stores", sql.Int, parseInt(paramData?.stores))
      .input("Cotton_Freight", sql.Int, parseInt(paramData?.cottonFreight))
      .input(
        "Transport_Freight",
        sql.Int,
        parseInt(paramData?.transportFreight)
      )
      .input(
        "YARN_AGENT_COMMISSION",
        sql.Int,
        parseInt(paramData?.yarnAgentCommission)
      )
      .input("SERVICE_ORDER", sql.Int, parseInt(paramData?.serviceOrder))
      .execute("web_sp_AdvanceRequisitionApproval_Stage2_Pending");

    const data = result.recordset;
    let results = data.map((item) => {
      const addId = Object.assign({ ...item, id: item.AdvanceRequisitionCode });
      return addId;
    });
    // Apply pagination manually
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getPaymentApproval = async (req, res) => {
  try {
    const paramData = req.query;

    // Extract pagination params with defaults
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    // Execute the stored procedure
    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("Cotton", sql.Int, parseInt(paramData?.cotton))
      .input("Stores", sql.Int, parseInt(paramData?.stores))
      .input("Cotton_Freight", sql.Int, parseInt(paramData?.cottonFreight))
      .input(
        "Transport_Freight",
        sql.Int,
        parseInt(paramData?.transportFreight)
      )
      .input(
        "YARN_AGENT_COMMISSION",
        sql.Int,
        parseInt(paramData?.yarnAgentCommission)
      )
      .input("SERVICE_ORDER", sql.Int, parseInt(paramData?.serviceOrder))
      .input(
        "LABOUR_AGENT_COMMISSION",
        sql.Int,
        parseInt(paramData?.labourAgentCommission)
      )
      .input("YARN_PURCHASE", sql.Int, parseInt(paramData?.yarnPurchase))
      .execute("web_sp_PaymentAppoval_GetPendings");

    const data = result.recordset;
    let results = data.map((item) => {
      const addId = Object.assign({ ...item, id: item.PaymentCode });
      return addId;
    });
    // Apply pagination manually
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getCreditNoteApproval = async (req, res) => {
  try {
    const paramData = req.query;

    // Extract pagination params with defaults
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    // Execute the stored procedure
    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_CreditNoteAppoval_GetPendings");

    const data = result.recordset;
    let results = data.map((item) => {
      const addId = Object.assign({ ...item, id: item.CreditNoteCode });
      return addId;
    });
    // Apply pagination manually
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getDebitNoteApproval = async (req, res) => {
  try {
    const paramData = req.query;

    // Extract pagination params with defaults
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    // Execute the stored procedure
    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("Cotton", sql.Int, parseInt(paramData?.cotton))
      .input("Stores", sql.Int, parseInt(paramData?.stores))
      .input("Cotton_Freight", sql.Int, parseInt(paramData?.cottonFreight))
      .input(
        "Transport_Freight",
        sql.Int,
        parseInt(paramData?.transportFreight)
      )
      .input(
        "yarnAgentCommission",
        sql.Int,
        parseInt(paramData?.yarnAgentCommission)
      )
      .input("ServiceOrder", sql.Int, parseInt(paramData?.serviceOrder))
      .execute("web_sp_DebitNoteAppoval_GetPendings");

    const data = result.recordset;
    let results = data.map((item) => {
      const addId = Object.assign({ ...item, id: item.DebitNoteCode });
      return addId;
    });
    // Apply pagination manually
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};