// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const getPurchaseAdviceApproval = async (req, res) => {
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
//       .execute("web_sp_PurchaseAdvice_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.PurchaseAdviceCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getPurchaseOrderApproval = async (req, res) => {
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
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_PurchaseOrder_Approval_1_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.PurchaseOrderCode });
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

// export const getPurchaseOrderGMApproval = async (req, res) => {
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
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_PurchaseOrder_Approval_2_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.PurchaseOrderCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getPurchaseOrderMDApproval = async (req, res) => {
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
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_PurchaseOrder_Approval_3_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.PurchaseOrderCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getBillPassingApproval = async (req, res) => {
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
//       .execute("web_sp_GRNApproval_GetPendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({
//         ...item,
//         id: item.PurchaseOrderReceivedCode,
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getGoodsInApproval = async (req, res) => {
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

//     // Run query against view instead of stored procedure
//     const result = await pool.request().query(`
//         Select GateInDate,GoodsPassNumber,CompanyName,GoodsInPassCode,GoodsTypeName,TransGoodsTypeName
//         from vw_GateEntryGoodsIn
//         where StoreInDate  IS NULL AND CompanyCode = ${parseInt(
//           paramData?.companyCode || 1
//         )}
//       `);

//     const data = result.recordset;

//     // Add id field if needed
//     const results = data.map((item) => {
//       return { ...item, id: item.WasteInvoiceCode }; // change to correct key column
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getGoodsOutApproval = async (req, res) => {
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
//       .execute("web_sp_GateEntry_GoodsOut_Approval_Stage1_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.GoodsOutPassCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getGoodsOut2Approval = async (req, res) => {
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
//       .execute("web_sp_GateEntry_GoodsOut_Approval_Stage2_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.GoodsOutPassCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getPurchaseReqApproval = async (req, res) => {
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
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_ItemRequistion_Approval_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.ItemRequisitionCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getPOAmendment1Approval = async (req, res) => {
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
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_PurchaseOrder_Amendment_Approval_1_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.PurchaseOrderCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getPOAmendment2Approval = async (req, res) => {
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
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_PurchaseOrder_Amendment_Approval_2_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.PurchaseOrderCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getIndent1Approval = async (req, res) => {
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
//       .execute("web_sp_IssueApproval1_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.ItemRequisitionCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getIndent2Approval = async (req, res) => {
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
//       .execute("web_sp_IssueApproval2_Pending");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.ItemRequisitionCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getIssueApproval = async (req, res) => {
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
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_Issue_Approval_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.IssueCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getStockAdjApproval = async (req, res) => {
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
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_StockAdjustmentApproval_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.StockAdjustmentCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getServiceReq1Approval = async (req, res) => {
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
//       .input("Approval", 0)
//       .input("Approval_2", 0)
//       .execute("web_sp_ServiceOrderRequisition_GetAll");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.SORCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getServiceReq2Approval = async (req, res) => {
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
//       .input("Approval", 1)
//       .input("Approval_2", 0)
//       .execute("web_sp_ServiceOrderRequisition_GetAll");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.SORCode });
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
//    res.status(500).json({ error: err.message });
//   }
// };

// export const getServiceBillPassApproval = async (req, res) => {
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
//       // .input("Approval", 1)
//       .execute("web_sp_ServiceOrderComplete_Approval_Pending");

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
//    res.status(500).json({ error: err.message });
//   }
// };

// 18 functions

import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { applyBranchCode, showBranchDropDown } from "../utils/common.js";

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

export const getPurchaseAdviceApproval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_PurchaseAdvice_Pending");

    const data = result.recordset;
    let results = data.map((item) => ({
      ...item,
      id: item.PurchaseAdviceCode,
    }));
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

export const getPurchaseOrderApproval = async (req, res) => {
  try {
    const paramData = req.query;
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
    if (request.parameters && request.parameters.CompanyCode) {
      delete request.parameters.CompanyCode;
    }
    let result = await request.execute(
      "web_sp_PurchaseOrder_Approval_1_Pendings",
    );

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.PurchaseOrderCode }));
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

export const getPurchaseOrderGMApproval = async (req, res) => {
  try {
    const paramData = req.query;
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
    if (request.parameters && request.parameters.CompanyCode) {
      delete request.parameters.CompanyCode;
    }
    let result = await request.execute(
      "web_sp_PurchaseOrder_Approval_2_Pendings",
    );

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.PurchaseOrderCode }));
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

export const getPurchaseOrderMDApproval = async (req, res) => {
  try {
    const paramData = req.query;
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
    if (request.parameters && request.parameters.CompanyCode) {
      delete request.parameters.CompanyCode;
    }
    let result = await request.execute(
      "web_sp_PurchaseOrder_Approval_3_Pendings",
    );

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.PurchaseOrderCode }));
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

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_GRNApproval_GetPendings");

    const data = result.recordset;
    let results = data.map((item) => ({
      ...item,
      id: item.PurchaseOrderReceivedCode,
    }));
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

export const getGoodsInApproval = async (req, res) => {
  try {
    const paramData = req.query;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    let query = `
      SELECT GateInDate, GoodsPassNumber, CompanyName, GoodsInPassCode, GoodsTypeName, TransGoodsTypeName 
      FROM vw_GateEntryGoodsIn 
      WHERE StoreInDate IS NULL 
    `;
    console.log(req.headers.subdbname, "Subdb name");

    // Fix: Add BranchCode filter if header exists
    // applyBranchCode(request, req.headers)
    const companyCode = req.headers.companyCode;
    const branchCode = req.headers.branchCode;
    console.log(branchCode, companyCode, 987878);
    const subdbname = showBranchDropDown(req.headers.subdbname)
    if (subdbname) {
      query += ` AND CompanyCode = ${companyCode} AND BranchCode = ${branchCode}`;
    } else {
      query += ` AND CompanyCode = ${companyCode} `;
    }

    const result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode || 1))
      .query(query);

    const data = result.recordset;

    // Ensure unique ID
    let results = data.map((item) => ({
      ...item,
      id: item.GoodsInPassCode || Math.random(),
    }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.log("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getGoodsOutApproval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_GateEntry_GoodsOut_Approval_Stage1_Pending");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.GoodsOutPassCode }));
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

export const getGoodsOut2Approval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_GateEntry_GoodsOut_Approval_Stage2_Pending");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.GoodsOutPassCode }));
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

export const getPurchaseReqApproval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request.execute(
      "web_sp_ItemRequistion_Approval_Pendings",
    );

    const data = result.recordset;
    let results = data.map((item) => ({
      ...item,
      id: item.ItemRequisitionCode,
    }));
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

export const getPOAmendment1Approval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request.execute(
      "web_sp_PurchaseOrder_Amendment_Approval_1_Pendings",
    );

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.PurchaseOrderCode }));
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

export const getPOAmendment2Approval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request.execute(
      "web_sp_PurchaseOrder_Amendment_Approval_2_Pendings",
    );

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.PurchaseOrderCode }));
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

export const getIndent1Approval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_IssueApproval1_Pending");

    const data = result.recordset;
    let results = data.map((item) => ({
      ...item,
      id: item.ItemRequisitionCode,
    }));
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

export const getIndent2Approval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .execute("web_sp_IssueApproval2_Pending");

    const data = result.recordset;
    let results = data.map((item) => ({
      ...item,
      id: item.ItemRequisitionCode,
    }));
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

export const getIssueApproval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request.execute("web_sp_Issue_Approval_Pendings");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.IssueCode }));
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

export const getStockAdjApproval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request.execute(
      "web_sp_StockAdjustmentApproval_Pendings",
    );

    const data = result.recordset;
    let results = data.map((item) => ({
      ...item,
      id: item.StockAdjustmentCode,
    }));
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

export const getServiceReq1Approval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request
      .input("Approval", 0)
      .input("Approval_2", 0)
      .execute("web_sp_ServiceOrderRequisition_GetAll");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.SORCode }));
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

export const getServiceReq2Approval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request
      .input("Approval", 1)
      .input("Approval_2", 0)
      .execute("web_sp_ServiceOrderRequisition_GetAll");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.SORCode }));
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

export const getServiceBillPassApproval = async (req, res) => {
  try {
    const paramData = req.query;
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

    let result = await request.execute(
      "web_sp_ServiceOrderComplete_Approval_Pending",
    );

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
