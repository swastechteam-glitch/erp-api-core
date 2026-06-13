// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const getInvoiceApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows
//     const offset = (page - 1) * pageSize;

//     // 2. Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_Pending_InvoiceList");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.InvoiceCode });
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
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getSalesOrderApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows
//     const offset = (page - 1) * pageSize;

//     // 2. Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_Pending_SalesOrderApproval_Multi");
//     console.log(result, "Sales Order result 44222");
//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.SOCode });
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
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getSalesReturnApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows
//     const offset = (page - 1) * pageSize;

//     // 2. Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_SalesReturnApprovalPending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.SalesReturnCode });
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
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getCustomerApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_Customer_GetAll_PendApprove");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.CustomerCode });
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
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getDespatchApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows
//     const offset = (page - 1) * pageSize;

//     // 2. Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_Pending_Packing");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.SalesReturnCode });
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
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getPOApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
//     const offset = (page - 1) * pageSize;

//     // 2. Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("Approval", 0)
//       .input("Reject", 0)
//       .execute("web_sp_YarnPurchaseOrder_GetAll");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.YarnPurchaseOrderCode });
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
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getTransFreightInvApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
//     const offset = (page - 1) * pageSize;

//     // 2. Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_TransportInvoice_Approval_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.TransInvoiceCode });
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
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getAgentCommissionApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
//     const offset = (page - 1) * pageSize;

//     // 2. Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_YarnAgentCommission_Approval_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.CommissionCode });
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
//     res.status(500).json({ error: err.message });
//   }
// };


// 8 functions


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

export const getInvoiceApproval = async (req, res) => {
  try {
    const paramData = req.query;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_Pending_InvoiceList");
  console.log(result, 'result.recordset42342');
  
    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.InvoiceCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getSalesOrderApproval = async (req, res) => {
  try {
    const paramData = req.query;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_Pending_SalesOrderApproval_Multi");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.SOCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getSalesReturnApproval = async (req, res) => {
  try {
    const paramData = req.query;
    // Ensure page and pageSize are positive integers
    const requestedPage = Math.max(1, parseInt(paramData?.page) || 1);
    const pageSize = Math.max(1, parseInt(paramData?.pageSize) || 5);

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_SalesReturnApprovalPending");

    // Add safety fallback for empty recordsets
    const data = result.recordset || [];
    const totalRecords = data.length;
    const totalPages = Math.ceil(totalRecords / pageSize);

    // FIX: Fallback to page 1 if the requested page is empty/out of range
    const currentPage = requestedPage > totalPages && totalPages > 0 ? 1 : requestedPage;
    const offset = (currentPage - 1) * pageSize;

    let results = data.map((item) => ({ ...item, id: item.SalesReturnCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: totalRecords,
      currentPage: currentPage, // Return the corrected page number
      pageSize: pageSize,
      totalPages: totalPages,
      data: paginatedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCustomerApproval = async (req, res) => {
  try {
    const paramData = req.query;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .execute("web_sp_Customer_GetAll_PendApprove");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.CustomerCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getDespatchApproval = async (req, res) => {
  try {
    const paramData = req.query;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_Pending_Packing");

    const data = result.recordset;
    // Note: Assuming SalesReturnCode is used as ID based on provided snippet, verify if PackingCode exists
    let results = data.map((item) => ({ ...item, id: item.SalesReturnCode })); 
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getPOApproval = async (req, res) => {
  try {
    const paramData = req.query;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("Approval", 0)
      .input("Reject", 0)
      .execute("web_sp_YarnPurchaseOrder_GetAll");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.YarnPurchaseOrderCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getTransFreightInvApproval = async (req, res) => {
  try {
    const paramData = req.query;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_TransportInvoice_Approval_Pending");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.TransInvoiceCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getAgentCommissionApproval = async (req, res) => {
  try {
    const paramData = req.query;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_YarnAgentCommission_Approval_Pending");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.CommissionCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};