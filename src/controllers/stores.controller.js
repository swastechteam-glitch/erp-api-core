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

// Stage-1 PO approval list WITH the WinForms filters: tab (pendings / approved /
// rejected) + Supplier + server-side paging. Calls the real SP
// sp_PurchaseOrder_Approval_1_Pendings, mirroring frmPurchaseOrderApproval_Stage1
// .BindPaged() exactly — optional @SupplierCode/@Approved/@Rejected, @PageNumber/
// @PageSize, and a TotalRecords column on row 0 (the SP pages internally). Kept
// SEPARATE from getPurchaseOrderApproval (the dashboard count) so that stays put.
export const getPurchaseOrderApprovalFiltered = async (req, res) => {
  try {
    const q = req.query;
    const page = parseInt(q?.page) || 1;
    const pageSize = parseInt(q?.pageSize) || 10;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Mirror BindPaged(): only the supplier + the active tab's flag are passed;
    // pendings passes neither @Approved nor @Rejected (SP defaults handle it).
    const supplierCode = parseInt(q?.supplierCode) || 0;
    if (supplierCode > 0) request.input("SupplierCode", sql.Int, supplierCode);
    if (parseInt(q?.approved) === 1) request.input("Approved", sql.Int, 1);
    if (parseInt(q?.rejected) === 1) request.input("Rejected", sql.Int, 1);
    request.input("PageNumber", sql.Int, page);
    request.input("PageSize", sql.Int, pageSize);

    const result = await request.execute("sp_PurchaseOrder_Approval_1_Pendings");
    const rows = (result.recordset || []).map((item) => ({
      ...item,
      id: item.PurchaseOrderCode,
    }));
    const totalRecords =
      rows.length > 0 && rows[0].TotalRecords != null
        ? Number(rows[0].TotalRecords)
        : rows.length;

    res.status(200).json({
      totalRecords,
      currentPage: page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      data: rows,
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

// Backfills OrderNo / OrderDate on approval-list rows straight from
// tbl_PurchaseOrder. The Stage-2/3 pending SPs don't surface the PO number/date
// under the OrderNo/OrderDate columns the list renders (Stage-1 does), so those
// two cells showed blank. One read-only query per page; no SP is changed.
const fillOrderNoDate = async (pool, rows) => {
  const blank = (v) => v === null || v === undefined || v === "";
  const codes = [
    ...new Set(rows.map((r) => Number(r.PurchaseOrderCode)).filter((n) => n > 0)),
  ];
  if (!codes.length) return rows;

  const lookup = await pool.request().query(
    `SELECT PurchaseOrderCode, PurchaseOrderNo, PurchaseOrderDate
     FROM tbl_PurchaseOrder WHERE PurchaseOrderCode IN (${codes.join(",")})`,
  );
  const byCode = {};
  (lookup.recordset || []).forEach((p) => {
    byCode[Number(p.PurchaseOrderCode)] = p;
  });

  return rows.map((r) => {
    const po = byCode[Number(r.PurchaseOrderCode)];
    if (!po) return r;
    return {
      ...r,
      OrderNo: blank(r.OrderNo) ? po.PurchaseOrderNo : r.OrderNo,
      OrderDate: blank(r.OrderDate) ? po.PurchaseOrderDate : r.OrderDate,
    };
  });
};

// Stage-2 (GM) PO approval list WITH the WinForms filters: tab + Supplier +
// @CompanyCode + server paging. Calls the real sp_PurchaseOrder_Approval_2_Pendings,
// mirroring frmPurchaseOrderApproval_Stage2.BindPaged(). Kept SEPARATE from
// getPurchaseOrderGMApproval (the dashboard count).
export const getPurchaseOrderGMApprovalFiltered = async (req, res) => {
  try {
    const q = req.query;
    const page = parseInt(q?.page) || 1;
    const pageSize = parseInt(q?.pageSize) || 10;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Mirror BindPaged(): @CompanyCode + Supplier + the active tab's flag.
    const cc = parseInt(q?.companyCode) || 0;
    if (cc > 0) request.input("CompanyCode", sql.Int, cc);
    const supplierCode = parseInt(q?.supplierCode) || 0;
    if (supplierCode > 0) request.input("SupplierCode", sql.Int, supplierCode);
    if (parseInt(q?.approved) === 1) request.input("Approved", sql.Int, 1);
    if (parseInt(q?.rejected) === 1) request.input("Rejected", sql.Int, 1);
    request.input("PageNumber", sql.Int, page);
    request.input("PageSize", sql.Int, pageSize);

    const result = await request.execute("sp_PurchaseOrder_Approval_2_Pendings");
    let rows = (result.recordset || []).map((item) => ({
      ...item,
      id: item.PurchaseOrderCode,
    }));
    rows = await fillOrderNoDate(pool, rows);
    const totalRecords =
      rows.length > 0 && rows[0].TotalRecords != null
        ? Number(rows[0].TotalRecords)
        : rows.length;

    res.status(200).json({
      totalRecords,
      currentPage: page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      data: rows,
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

// Stage-3 (MD) PO approval list WITH the WinForms filters: tab + Supplier +
// @CompanyCode + server paging. Calls the real sp_PurchaseOrder_Approval_3_Pendings,
// mirroring frmPurchaseOrderApproval_Stage3.BindPaged(). Kept SEPARATE from
// getPurchaseOrderMDApproval (the dashboard count).
export const getPurchaseOrderMDApprovalFiltered = async (req, res) => {
  try {
    const q = req.query;
    const page = parseInt(q?.page) || 1;
    const pageSize = parseInt(q?.pageSize) || 10;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Mirror BindPaged(): @CompanyCode + Supplier + the active tab's flag.
    const cc = parseInt(q?.companyCode) || 0;
    if (cc > 0) request.input("CompanyCode", sql.Int, cc);
    const supplierCode = parseInt(q?.supplierCode) || 0;
    if (supplierCode > 0) request.input("SupplierCode", sql.Int, supplierCode);
    if (parseInt(q?.approved) === 1) request.input("Approved", sql.Int, 1);
    if (parseInt(q?.rejected) === 1) request.input("Rejected", sql.Int, 1);
    request.input("PageNumber", sql.Int, page);
    request.input("PageSize", sql.Int, pageSize);

    const result = await request.execute("sp_PurchaseOrder_Approval_3_Pendings");
    let rows = (result.recordset || []).map((item) => ({
      ...item,
      id: item.PurchaseOrderCode,
    }));
    rows = await fillOrderNoDate(pool, rows);
    const totalRecords =
      rows.length > 0 && rows[0].TotalRecords != null
        ? Number(rows[0].TotalRecords)
        : rows.length;

    res.status(200).json({
      totalRecords,
      currentPage: page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      data: rows,
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
