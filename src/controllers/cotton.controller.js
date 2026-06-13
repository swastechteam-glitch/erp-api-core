// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const getQualityTestApproval = async (req, res) => {
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
//       .execute("web_sp_CottonQualityTestApproval_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.CQTCode });
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
// export const getPurchaseOrderApproval = async (req, res) => {
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
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_CottonPurchaseOrderApproval_Pendings");

//     const data = result.recordset;

//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.CPOCode });
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

// export const getIssueLotTestApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || process.env.PAGE;
//     const pageSize = parseInt(paramData?.pageSize) || process.env.TOTAL_RECORDS;
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute stored procedure with pagination params
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_CottonLotApproval_GetPendings");

//     const data = result.recordset;

    

//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.ArrivalCode });
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

// export const getTransferApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("FYCode", sql.Int, parseInt(paramData?.fyCode))
//       .execute("web_sp_CottonTransfer_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.CPOCode });
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

// export const getBillPassingApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("FYCode", sql.Int, parseInt(paramData?.fyCode))
//       // .execute("sp_Cotton_BillPassing_Approval1_Pending");   // is this feature code
//       .execute("web_sp_CottonBillPassing_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.ArrivalCode });
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

// export const getCottonAllowanceApproval = async (req, res) => {
//   try {
//     const paramData = req.query;
//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
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
//       // .input("FYCode", sql.Int, parseInt(paramData?.fyCode))
//       .execute("web_sp_CottonAllowance_Approval_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.ArrivalCode });
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

// export const getSupplierCurBalApproval = async (req, res) => {
//   try {
//     const paramData = req.query;
//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
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
//       // .input("FYCode", sql.Int, parseInt(paramData?.fyCode))
//       .execute("web_sp_Supplier_GetAll_PendApprove");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.SupplierCode });
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

// export const getRejectLotApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       // .input("FYCode", sql.Int, parseInt(paramData?.fyCode))
//       .execute("web_sp_CottonQualityTestApproval_Pendings_MD");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.CQTCode });
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

// export const getArrival1Approval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
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
//       // .input("FYCode", sql.Int, parseInt(paramData?.fyCode))
//       .execute("web_sp_CottonArrival_QCApproval_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.ArrivalCode });
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

// export const getArrival2Approval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
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
//       // .input("FYCode", sql.Int, parseInt(paramData?.fyCode))
//       .execute("web_sp_CottonArrival_MDApproval_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.ArrivalCode });
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

// export const getWeighApproveToStockApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
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
//       // .input("FYCode", sql.Int, parseInt(paramData?.fyCode))
//       .execute("web_sp_Cotton_Weighment_Approval_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.WeighmentCode });
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

// export const getWeighApproveForPaymentApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       // .input("FYCode", sql.Int, parseInt(paramData?.fyCode))
//       .execute("web_sp_CottonWeightApproval_Payment_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.WeighmentCode });
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

// export const getAllowanceGenerationApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1; // default page 1
//     const pageSize = parseInt(paramData?.pageSize) || 5; // default 10 rows per page
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
//       // .input("FYCode", sql.Int, parseInt(paramData?.fyCode))
//       .execute("web_sp_CottonAllowance_Approval_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.ArrivalCode });
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



import sql from 'mssql';
import { getPool } from "../config/dynamicDB.js";
import { applyBranchCode } from '../utils/common.js';

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

export const getQualityTestApproval = async (req, res) => {
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

    let result = await request.execute("web_sp_CottonQualityTestApproval_Pendings");

    // Add safety fallback for empty recordsets
    const data = result.recordset || [];
    const totalRecords = data.length;
    const totalPages = Math.ceil(totalRecords / pageSize);

    // FIX: Fallback to page 1 if the requested page is empty/out of range
    const currentPage = requestedPage > totalPages && totalPages > 0 ? 1 : requestedPage;
    const offset = (currentPage - 1) * pageSize;

    let results = data.map((item) => ({ ...item, id: item.CQTCode }));
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
export const getPurchaseOrderApproval = async (req, res) => {
  try {
    const paramData = req.query;
    // Ensure these are numbers and defaults are sensible
    const page = Math.max(1, parseInt(paramData?.page) || 1);
    const pageSize = Math.max(1, parseInt(paramData?.pageSize) || 5);

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    applyBranchCode(request, req.headers);

    let result = await request.execute("web_sp_CottonPurchaseOrderApproval_Pendings");
    
    const data = result.recordset || []; // Safety check for empty recordsets
    const totalRecords = data.length;
    const totalPages = Math.ceil(totalRecords / pageSize);

    // If requested page is higher than total pages, default to page 1 
    // or return empty (Adjust based on your preference)
    const activePage = page > totalPages ? 1 : page;
    const offset = (activePage - 1) * pageSize;

    let results = data.map((item) => ({ ...item, id: item.CPOCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: totalRecords,
      currentPage: activePage, // Send back the page actually used
      pageSize: pageSize,
      totalPages: totalPages,
      data: paginatedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getIssueLotTestApproval = async (req, res) => {
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

    let result = await request.execute("web_sp_CottonLotApproval_GetPendings");

    const data = result.recordset || [];
    const totalRecords = data.length;
    const totalPages = Math.ceil(totalRecords / pageSize);

    // FIX: Fallback to page 1 if the requested page is empty/out of range
    const currentPage = requestedPage > totalPages && totalPages > 0 ? 1 : requestedPage;
    const offset = (currentPage - 1) * pageSize;

    let results = data.map((item) => ({ ...item, id: item.ArrivalCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: totalRecords,
      currentPage: currentPage,
      pageSize: pageSize,
      totalPages: totalPages,
      data: paginatedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getTransferApproval = async (req, res) => {
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
    request.input("FYCode", sql.Int, parseInt(paramData?.fyCode));

    let result = await request.execute("web_sp_CottonTransfer_Pending");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.CPOCode }));
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

export const getBillPassingApproval = async (req, res) => {
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
    request.input("FYCode", sql.Int, parseInt(paramData?.fyCode));

    let result = await request.execute("web_sp_CottonBillPassing_Pendings");

    // Add safety fallback for empty recordsets
    const data = result.recordset || [];
    const totalRecords = data.length;
    const totalPages = Math.ceil(totalRecords / pageSize);

    // FIX: Fallback to page 1 if the requested page is empty/out of range
    const currentPage = requestedPage > totalPages && totalPages > 0 ? 1 : requestedPage;
    const offset = (currentPage - 1) * pageSize;

    let results = data.map((item) => ({ ...item, id: item.ArrivalCode }));
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

export const getCottonAllowanceApproval = async (req, res) => {
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

    let result = await request.execute("web_sp_CottonAllowance_Approval_Pending");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.ArrivalCode }));
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

// export const getCottonAllowanceApproval = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res.status(400).json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const request = pool.request();

//     // FIX: Create a clone of the headers and remove companyCode.
//     // This prevents the common applyBranchCode function from attaching @CompanyCode to the SP.
//     const modifiedHeaders = { ...req.headers };
//     delete modifiedHeaders['companycode'];
//     delete modifiedHeaders['companyCode'];

//     // Pass the modified headers instead of req.headers
//     applyBranchCode(request, modifiedHeaders);

//     let result = await request.execute("web_sp_CottonAllowance_Approval_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => ({ ...item, id: item.ArrivalCode }));
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

export const getSupplierCurBalApproval = async (req, res) => {
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

    let result = await request.execute("web_sp_Supplier_GetAll_PendApprove");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.SupplierCode }));
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

export const getRejectLotApproval = async (req, res) => {
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

    let result = await request.execute("web_sp_CottonQualityTestApproval_Pendings_MD");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.CQTCode }));
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

export const getArrival1Approval = async (req, res) => {
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

    let result = await request.execute("web_sp_CottonArrival_QCApproval_Pendings");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.ArrivalCode }));
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

export const getArrival2Approval = async (req, res) => {
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

    let result = await request.execute("web_sp_CottonArrival_MDApproval_Pendings");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.ArrivalCode }));
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

export const getWeighApproveToStockApproval = async (req, res) => {
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

    let result = await request.execute("web_sp_Cotton_Weighment_Approval_Pending");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.WeighmentCode }));
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

export const getWeighApproveForPaymentApproval = async (req, res) => {
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

    let result = await request.execute("web_sp_CottonWeightApproval_Payment_Pending");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.WeighmentCode }));
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

export const getAllowanceGenerationApproval = async (req, res) => {
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

    let result = await request.execute("web_sp_CottonAllowance_Approval_Pending");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.ArrivalCode }));
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