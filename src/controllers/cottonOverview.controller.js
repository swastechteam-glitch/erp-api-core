// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";
// import { log } from "console";
// // **************APPROVALS**************

// export const approveCotton = async (req, res) => {
//   const { approvalDate, cpoCode, remarks, reject, companyCode, message } =
//     req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const FYCode = req.headers.FYCode;
//     const nodeCode = req.headers.nodeCode;
//     const userId = req.headers.userId;
//     // Step 2: DB Transaction

//     const transaction = new sql.Transaction(pool);

//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);
//       await request
//         .input("ApprovalDate", sql.DateTime, new Date(approvalDate))
//         .input("CPOCode", sql.Int, cpoCode)
//         .input("Remarks", sql.NVarChar(500), remarks || "")
//         .input("Reject", sql.Bit, reject)
//         .input("FYCode", sql.Int, FYCode)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode)
//         .execute("sp_CottonPurchaseOrderApprove_Insert");

//       // Notification Update
//       const request1 = new sql.Request(transaction);
//       await request1
//         .input("ApprovalID", sql.Int, cpoCode)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "COTTON")
//         .input("subModuleName", sql.NVarChar, "Cotton Purchase Order Approval")
//         .execute("web_sp_Notification_Update");

//       await request.batch(`
//         EXEC sp_CottonPurchaseOrderApproval_Pendings;
//         UPDATE tbl_DashBoard
//         SET Cotton_PurchaseOrder_Approval_Pendings = @@ROWCOUNT
//         WHERE CompanyCode = ${companyCode};
//       `);

//       await transaction.commit();
//       return res.status(201).json({ success: true, message: message });
//     } catch (err) {
//       await transaction.rollback();

//       if (err.message.includes("UK_tbl_Purchase_PurchaseName")) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Please Check the Entry" });
//       }

//       return res.status(500).json({ success: false, error: err.message });
//     }
//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const approveQualityTest = async (req, res) => {
//   const {
//     approvalDate,
//     cqtCode,
//     arrivalCode,
//     grade,
//     yarnType,
//     remarks,
//     ratePerCandy,
//     reject,
//     mdReject,
//     companyCode,
//     message,
//   } = req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });
//     const pool = await getPool(req.headers.subdbname);
//     const FYCode = req.headers.FYCode;
//     const nodeCode = req.headers.nodeCode;
//     const userId = req.headers.userId;
//     // Step 2: DB Transaction

//     const transaction = new sql.Transaction(pool);

//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);
//       await request
//         .input("CQTApprovalDate", sql.DateTime, new Date(approvalDate))
//         .input("CQTCode", sql.Int, cqtCode)
//         .input("ArrivalCode", sql.Int, arrivalCode)
//         .input("Grade", sql.NVarChar(500), grade || null)
//         .input("YarnType", sql.NVarChar(500), yarnType || null)
//         .input("Remarks", sql.NVarChar(500), remarks || null)
//         .input("RatePerCandy", sql.Decimal, ratePerCandy)
//         .input("Reject", sql.Bit, reject)
//         .input("MD_Reject", sql.Bit, null)
//         .input("FYCode", sql.Int, FYCode)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode)
//         .execute("sp_CottonQualityTestApproval_AddEdit");

//       // Grade update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("Grade", sql.NVarChar(500), grade || null)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("CQTCode", sql.Int, cqtCode).query(`
//       UPDATE tbl_CottonQualityTest
//       SET Grade = @Grade
//       WHERE CompanyCode = @CompanyCode AND CQTCode = @CQTCode
//   `);

//       // Notification Update
//       const request4 = new sql.Request(transaction);
//       await request4
//         .input("ApprovalID", sql.Int, cqtCode)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "COTTON")
//         .input("subModuleName", sql.NVarChar, "Cotton Quality Test Approval")
//         .execute("web_sp_Notification_Update");

//       const request2 = new sql.Request(transaction);
//       await request2.batch(`
//    EXEC sp_CottonQualityTestApproval_Pendings
//    UPDATE tbl_DashBoard
//    SET Cotton_QualityTest_Approval_Pendings = @@ROWCOUNT
//     `);

//       await transaction.commit();
//       const isApprove = !reject && !mdReject; // define properly

//       return res.status(201).json({
//         success: true,
//         message: isApprove
//           ? "Approved Successfully!"
//           : "Rejected Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();

//       if (err.message.includes("UK_")) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Already Approved !" });
//       }

//       return res.status(500).json({ success: false, error: err.message });
//     }
//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const approveIssueLotTest = async (req, res) => {
//   const {
//     approvalDate,
//     cqtCode,
//     arrivalCode,
//     grade,
//     yarnType,
//     remarks,
//     ratePerCandy,
//     reject,
//     mdReject,
//     companyCode,
//     message,
//   } = req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const FYCode = req.headers.FYCode;
//     const nodeCode = req.headers.nodeCode;
//     const userId = req.headers.userId;

//     const transaction = new sql.Transaction(pool);

//     await transaction.begin();

//     try {
//       const request1 = new sql.Request(transaction);

//       if (
//         req.headers.subdbname === "KPF" ||
//         req.headers.subdbname === "LOCALHOST"
//       ) {
//         request1.input("ArrivalCode", sql.Int, arrivalCode);
//       }

//       let getApprovaltNo = await request1
//         // .input("ArrivalCode", sql.Int, arrivalCode)
//         .input("CompanyCode", sql.Int, parseInt(companyCode))
//         .input("FYCode", sql.Int, parseInt(FYCode))
//         .execute("sp_CottonLotApproval_No");

//       const request2 = new sql.Request(transaction);
//       await request2
//         .input("CottonLotApprovalDate", sql.DateTime, new Date(approvalDate))
//         .input(
//           "CottonLotApprovalNo",
//           sql.Int,
//           getApprovaltNo.recordset[0]["LotApprovalNo"]
//         )
//         .input("ArrivalCode", sql.Int, arrivalCode)
//         .input("Remarks", sql.NVarChar(500), remarks || null)
//         .input("FYCode", sql.Int, FYCode)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode)
//         .execute("sp_CottonLotApproval_AddEdit");

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, arrivalCode)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "COTTON")
//         .input("subModuleName", sql.NVarChar, "Cotton Issue Lot Approval")
//         .execute("web_sp_Notification_Update");

//       await request2.batch(`
//         EXEC sp_CottonLotApproval_GetPendings;
//         UPDATE tbl_DashBoard
//         SET Cotton_LotApproval_Pendings = @@ROWCOUNT;
//       `);

//       await transaction.commit();
//       return res.status(201).json({
//         success: true,
//         message:
//           reject || mdReject
//             ? "Rejected Successfully!"
//             : "Approved Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();

//       if (err.message.includes("UK_")) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Already Approved !" });
//       }

//       return res.status(500).json({ success: false, error: err.message });
//     }
//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const approveBillPassing = async (req, res) => {
//   const { billPassingDate, arrivalCode, remarks, companyCode, isApprove } =
//     req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const FYCode = req.headers.FYCode;
//     const nodeCode = req.headers.nodeCode;
//     const userId = req.headers.userId;
//     let message;
//     // Step 2: DB Transaction

//     const transaction = new sql.Transaction(pool);

//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);
//       const request1 = new sql.Request(transaction);
//       if (isApprove) {
//         await request
//           .input("BillPassingDate", sql.DateTime, new Date(billPassingDate))
//           .input("ArrivalCode", sql.Int, arrivalCode)
//           .input("Remarks", sql.NVarChar(500), remarks || null)
//           .input("FYCode", sql.Int, FYCode)
//           .input("CompanyCode", sql.Int, companyCode)
//           .input("User", sql.Int, userId)
//           .input("Node", sql.Int, nodeCode)
//           .execute("sp_CottonBillPassing_Insert");
//       } else {
//         let getBales = await pool
//           .request()
//           .input("CompanyCode", sql.Int, parseInt(companyCode))
//           .input("ArrivalCode", sql.Int, parseInt(arrivalCode))
//           .execute("sp_CottonReject_GetBales");

//         let getRejectNo = await pool
//           .request()
//           .input("CompanyCode", sql.Int, parseInt(companyCode))
//           .input("FYCode", sql.Int, parseInt(FYCode))
//           .execute("sp_CottonReject_No");

//         const cottonReject = await request
//           .input(
//             "CottonRejectNo",
//             sql.Int,
//             getRejectNo.recordset[0]["CottonRejectNo"]
//           )
//           .input("CottonRejectDate", sql.DateTime, new Date(billPassingDate))
//           .input("ArrivalCode", sql.Int, arrivalCode)
//           .input("NoofBales", sql.Int, getBales.recordset[0].NoofBales)
//           .input("Remarks", sql.NVarChar(500), remarks || null)
//           .input("RejectSales", 1)
//           .input("FYCode", sql.Int, FYCode)
//           .input("CompanyCode", sql.Int, companyCode)
//           .input("User", sql.Int, userId)
//           .input("Node", sql.Int, nodeCode)
//           .execute("sp_CottonReject_AddEdit");

//         await request1
//           .input("CottonRejectCode", sql.Int, cottonReject.recordset[0][""])
//           .input("CompanyCode", sql.Int, companyCode)
//           .execute("sp_CottonRejectDetails_Delete");

//         for (
//           let rowIndex = 0;
//           rowIndex < getBales.recordset.length;
//           rowIndex++
//         ) {
//           const row = getBales.recordset[rowIndex];
//           await new sql.Request(transaction) // use same transaction!
//             .input("CottonRejectCode", sql.Int, cottonReject.recordset[0][""])
//             .input("SNo", sql.Int, rowIndex + 1)
//             .input("WeighmentDetailsCode", sql.Int, row.WeighmentDetailsCode)
//             .input("BaleNo", sql.Int, row.BaleNo)
//             .input("GrossWeight", sql.Numeric(12, 3), row.GrossWeight)
//             .input("Allowance", sql.Numeric(12, 3), row.Allowance)
//             .input("SampleWeight", sql.Numeric(12, 3), row.SampleWeight)
//             .input("TareWeight", sql.Numeric(12, 3), row.TareWeight)
//             .input("NetWeight", sql.Numeric(12, 3), row.NetWeight)
//             .input("CompanyCode", sql.Int, companyCode)
//             .execute("sp_CottonRejectDetails_AddEdit");
//         }
//       }

//       // Notification Update
//       const request2 = new sql.Request(transaction);
//       await request2
//         .input("ApprovalID", sql.Int, arrivalCode)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "COTTON")
//         .input("subModuleName", sql.NVarChar, "Cotton BillPassing Approval")
//         .execute("web_sp_Notification_Update");

//       await request.batch(`
//       EXEC  sp_CottonBillPassing_Pendings --@FYCode = @FYCode
//       UPDATE tbl_DashBoard Set Cotton_BillPassing_Pendings  =  @@ROWCOUNT
//       `);

//       await transaction.commit();
//       return res.status(201).json({
//         success: true,
//         message: isApprove
//           ? "Approved Successfully!"
//           : "Rejected Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();

//       if (err.message.includes("UK_")) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Already Approved !" });
//       }

//       return res.status(500).json({ success: false, error: err.message });
//     }
//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const approveAllowanceGeneration = async (req, res) => {
//   const {
//     approvalDate,
//     arrivalCode,
//     remarks,
//     creditNoteNo,
//     creditNoteDate,
//     creditNoteAmount,
//     companyCode,
//     isApprove,
//   } = req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const FYCode = req.headers.FYCode;
//     const nodeCode = req.headers.nodeCode;
//     const userId = req.headers.userId;

//     const transaction = new sql.Transaction(pool);

//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);
//       const request1 = new sql.Request(transaction);
//       const request2 = new sql.Request(transaction);

//       let getAllowanceNo = await pool
//         .request()
//         .input("CompanyCode", sql.Int, parseInt(companyCode))
//         .input("FYCode", sql.Int, parseInt(FYCode))
//         .execute("sp_CottonAllowance_No");

//       let getAllowanceKGS = await pool
//         .request()
//         .input("ArrivalCode", sql.Int, parseInt(arrivalCode)).query(`
//         SELECT TotalDifferenceKG
//         FROM tbl_CottonAllowance_Generation
//         WHERE ArrivalCode = @ArrivalCode
//       `);

//       if (isApprove) {
//         await request
//           .input("Approval_Date", sql.DateTime, new Date(approvalDate))
//           .input("ArrivalCode", sql.Int, arrivalCode)
//           .input("Approval_Amount", sql.Numeric(12, 2), creditNoteAmount)
//           .input("User", sql.Int, userId)
//           .input("Node", sql.Int, nodeCode)
//           .execute("sp_CottonAllowance_Generation_Approval_Update");

//         await request1
//           .input(
//             "CottonAllowanceNo",
//             sql.Int,
//             getAllowanceNo.recordset[0]["CQTNO"]
//           )
//           .input("CottonAllowanceDate", sql.DateTime, new Date(approvalDate))
//           .input("ArrivalCode", sql.Int, arrivalCode)
//           .input(
//             "AllowanceKgs",
//             sql.Numeric(12, 3),
//             getAllowanceKGS.recordset[0]["TotalDifferenceKG"]
//           )
//           .input("AllowanceCandyRate", 0)
//           .input("CreditNoteNo", sql.NVarChar(50), creditNoteNo || null)
//           .input(
//             "CreditNoteDate",
//             sql.DateTime,
//             creditNoteDate != null ? new Date(creditNoteDate) : null
//           )
//           .input(
//             "CreditNoteAmount",
//             sql.Numeric(12, 2),
//             creditNoteAmount || null
//           )
//           .input("Remarks", sql.NVarChar(250), remarks || null)
//           .input("FYCode", sql.Int, FYCode)
//           .input("CompanyCode", sql.Int, companyCode)
//           .input("User", sql.Int, userId)
//           .input("Node", sql.Int, nodeCode)
//           .execute("sp_CottonAllowance_AddEdit");
//       } else {
//         await request2
//           .input("Reject_Date", sql.DateTime, new Date(approvalDate))
//           .input("ArrivalCode", sql.Int, arrivalCode)
//           .input("User", sql.Int, userId)
//           .input("Node", sql.Int, nodeCode)
//           .execute("sp_CottonAllowance_Generation_Reject_Update");
//       }

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, arrivalCode)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "COTTON")
//         .input("subModuleName", sql.NVarChar, "Cotton Allowance Approval")
//         .execute("web_sp_Notification_Update");

//       await request.batch(`
//       EXEC  sp_CottonAllowance_Approval_Pending
//       UPDATE tbl_DashBoard Set Cotton_AllowanceGeneration_ApprovalPendings  =  @@ROWCOUNT
//       `);

//       await transaction.commit();
//       return res.status(201).json({
//         success: true,
//         message: isApprove
//           ? "Approved Successfully!"
//           : "Rejected Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();

//       if (err.message.includes("UK_")) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Already Approved !" });
//       }

//       return res.status(500).json({ success: false, error: err.message });
//     }
//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const approveRejectLot = async (req, res) => {
//   const {
//     CQTApprovalCode,
//     approvalDate,
//     CQTCode,
//     arrivalCode,
//     grade,
//     yarnType,
//     remarks,
//     ratePerCandy,
//     companyCode,
//     isApprove,
//     message,
//   } = req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const FYCode = req.headers.FYCode;
//     const nodeCode = req.headers.nodeCode;
//     const userId = req.headers.userId;
//     let message;

//     const transaction = new sql.Transaction(pool);

//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);
//       const request2 = new sql.Request(transaction);

//       await request
//         // .input("CQTApprovalCode", sql.Int, CQTApprovalCode)
//         .input("CQTApprovalDate", sql.DateTime, new Date(approvalDate))
//         .input("CQTCode", sql.Int, CQTCode)
//         .input("ArrivalCode", sql.Int, arrivalCode)
//         .input("Grade", sql.NVarChar(50), grade)
//         // .input("YarnType", sql.NVarChar(50), yarnType)
//         .input("Remarks", sql.NVarChar(200), remarks || null)
//         .input("RatePerCandy", sql.Numeric(12, 2), ratePerCandy)
//         .input("Reject", isApprove ? 0 : 1)
//         .input("MD_Reject", isApprove ? 0 : 1)
//         .input("FYCode", sql.Int, FYCode)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode)
//         .execute("sp_CottonQualityTestApproval_AddEdit");

//       await request2
//         .input("Grade", sql.NVarChar(500), grade || null)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("CQTCode", sql.Int, CQTCode).query(`
//       UPDATE tbl_CottonQualityTest
//       SET Grade = @Grade
//       WHERE CompanyCode = @CompanyCode AND CQTCode = @CQTCode
//   `);

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, CQTCode)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "COTTON")
//         .input("subModuleName", sql.NVarChar, "Cotton Reject Lot Approval")
//         .execute("web_sp_Notification_Update");

//       await request.batch(`
//       EXEC  sp_CottonQualityTestApproval_Pendings_MD
//       UPDATE tbl_DashBoard Set Cotton_RejectLot_Approval_Pendings  =  @@ROWCOUNT
//       `);

//       await transaction.commit();
//       return res.status(201).json({
//         success: true,
//         message: isApprove
//           ? "Approved Successfully!"
//           : "Rejected Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();

//       if (err.message.includes("UK_")) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Already Approved !" });
//       }

//       return res.status(500).json({ success: false, error: err.message });
//     }
//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// // **************OVERVIEWS**************

// export const getPurchaseOrderOverview = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const paramId = req.params;

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
//     let mainResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("CPOCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_CottonPurchaseOrder_GetAll");

//     let detailedResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("CPOCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_CottonPurchaseOrderDetails_GetAll");

//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       id: mainResult?.recordsets?.[0]?.[0]?.CPOCode,
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
//     console.log("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getQualityTestOverview = async (req, res) => {
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
//       .input("CQTCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_CottonQualityTest_GetAll");

//     let detailedResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("CQTCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_CottonQualityTestDetails_GetAll");

//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       id: mainResult?.recordsets?.[0]?.[0]?.CQTCode,
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

// export const getIssueLotOverview = async (req, res) => {
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

//     // Run SELECT query with parameter
//     const result = await pool
//       .request()
//       .input("ArrivalCode", sql.Int, parseInt(paramId?.id)).query(`
//         SELECT ArrivalDate, SupplierName, AgentName, RawMaterialName, StationName, Qty, TotalNetWeight, ArrivalCode
//         FROM vw_CottonWeighment
//         WHERE ArrivalCode = @ArrivalCode
//       `);
//     const totalRecords = result?.recordset?.length || 0;
//     const addId = Object.assign({
//       ...result.recordset?.[0],
//       id: result.recordset?.[0]?.ArrivalCode,
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

// export const getBillPassingOverview = async (req, res) => {
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

//     let mainResult, detailedResult;

//     if (
//       req.headers.subdbname === "KAS" ||
//       req.headers.subdbname === "LOCALHOST"
//     ) {
//       // Execute the stored procedure
//       mainResult = await pool
//         .request()
//         // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//         .input("ArrivalCode", sql.Int, parseInt(paramId?.id))
//         .execute("web_sp_CottonPayment_BillPassing_Load");

//       detailedResult = await pool
//         .request()
//         // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//         .input("ArrivalCode", sql.Int, parseInt(paramId?.id))
//         .execute("web_sp_CottonQualityTestDetails_GetAll");
//     } else {
//       mainResult = await pool
//         .request()
//         // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//         .input("ArrivalCode", sql.Int, parseInt(paramId?.id))
//         .execute("web_sp_CottonWeighment_ApprovalDetails_GetAll");

//       detailedResult = await pool
//         .request()
//         // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//         .input("ArrivalCode", sql.Int, parseInt(paramId?.id))
//         .execute("web_sp_CottonWeighment_ApprovalDetails_GetAll");
//     }
//     console.log(mainResult, "mainResult 4334");

//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       id: mainResult?.recordsets?.[0]?.[0]?.ArrivalCode,
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
//     console.error("DB Error:", err.message);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getAllowanceGenerationOverview = async (req, res) => {
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
//       .input("ArrivalCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_CottonAllowance_Generation_GetAll");

//     const totalRecords = mainResult?.recordset?.length || 0;
//     const addId = Object.assign({
//       ...mainResult.recordset?.[0],
//       id: mainResult.recordset?.[0]?.ArrivalCode,
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

// export const getRejectLotOverview = async (req, res) => {
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
//     let mainOutput = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("CQTCode", sql.Int, parseInt(paramId?.id))
//       .execute("sp_CottonQualityTestApproval_Pendings_MD");

//     const result = await pool
//       .request()
//       .input("CQTCode", sql.Int, parseInt(paramId?.id)).query(`
//         SELECT *
//         FROM vw_CottonQualityTestDetails
//         WHERE CQTCode = @CQTCode
//       `);
//     console.log(result?.rowsAffected?.[0], 6444);

//     const totalRecords = result?.rowsAffected?.[0] || 0;
//     const addId = Object.assign({
//       ...mainOutput?.recordsets?.[0]?.[0],
//       id: mainOutput?.recordsets?.[0]?.[0]?.CQTCode,
//     });

//     const paginatedData = result?.recordset?.slice(offset, offset + pageSize);
//     const outputData = {
//       mainOutput: addId,
//       detailedOutput: paginatedData,
//     };

//     res.status(200).json({
//       totalRecords,
//       currentPage: page,
//       pageSize,
//       totalPages: Math.ceil(totalRecords / pageSize),
//       data: outputData,
//     });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { log } from "console";
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

// ************** APPROVALS **************

export const approveCotton = async (req, res) => {
  const { approvalDate, cpoCode, remarks, reject, companyCode, message } =
    req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { FYCode, nodeCode, userId } = req.headers;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      await request
        .input("ApprovalDate", sql.DateTime, new Date(approvalDate))
        .input("CPOCode", sql.Int, cpoCode)
        .input("Remarks", sql.NVarChar(500), remarks || "")
        .input("Reject", sql.Bit, reject)
        .input("FYCode", sql.Int, FYCode)
        // .input("CompanyCode", sql.Int, companyCode)
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode)
        .execute("sp_CottonPurchaseOrderApprove_Insert");

      // Notification Update
      const request1 = new sql.Request(transaction);
      applyBranchCode(request1, req.headers); // 👈 Fix applied

      if (request1.parameters && request1.parameters.CompanyCode) {
        delete request1.parameters.CompanyCode;
      }

      await request1
        .input("ApprovalID", sql.Int, cpoCode)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "COTTON")
        .input("subModuleName", sql.NVarChar, "Cotton Purchase Order Approval")
        .execute("web_sp_Notification_Update");

      // Batch Update
      await request.batch(`
        EXEC sp_CottonPurchaseOrderApproval_Pendings;
        UPDATE tbl_DashBoard
        SET Cotton_PurchaseOrder_Approval_Pendings = @@ROWCOUNT
        WHERE CompanyCode = ${companyCode};
      `);

      await transaction.commit();
      return res.status(201).json({ success: true, message: message });
    } catch (err) {
      await transaction.rollback();
      if (err.message.includes("UK_tbl_Purchase_PurchaseName")) {
        return res
          .status(400)
          .json({ success: false, message: "Please Check the Entry" });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const approveQualityTest = async (req, res) => {
  const {
    approvalDate,
    cqtCode,
    arrivalCode,
    grade,
    yarnType,
    remarks,
    ratePerCandy,
    reject,
    mdReject,
    companyCode,
    message,
  } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { FYCode, nodeCode, userId } = req.headers;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      // applyBranchCode(request, req.headers); // 👈 Fix applied

      await request
        .input("CQTApprovalDate", sql.DateTime, new Date(approvalDate))
        .input("CQTCode", sql.Int, cqtCode)
        .input("ArrivalCode", sql.Int, arrivalCode)
        .input("Grade", sql.NVarChar(500), grade || null)
        .input("YarnType", sql.NVarChar(500), yarnType || null)
        .input("Remarks", sql.NVarChar(500), remarks || null)
        .input("RatePerCandy", sql.Decimal, ratePerCandy || 0)
        .input("Reject", sql.Bit, reject)
        .input("MD_Reject", sql.Bit, 0)
        .input("FYCode", sql.Int, FYCode)
        // .input("CompanyCode", sql.Int, companyCode)
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode)
        .execute("sp_CottonQualityTestApproval_AddEdit");

      // Grade update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      const subdbname = showBranchDropDown(req.headers.subdbname);
      await request3
        .input("Grade", sql.NVarChar(500), grade || null)
        // .input("CompanyCode", sql.Int, companyCode)
        .input("CQTCode", sql.Int, cqtCode).query(`
            UPDATE tbl_CottonQualityTest
            SET Grade = @Grade
            WHERE ${subdbname ? "BranchCode  = @BranchCode" : `CompanyCode = @CompanyCode`} AND CQTCode = @CQTCode
        `);

      // Notification Update
      const request4 = new sql.Request(transaction);
      applyBranchCode(request4, req.headers); // 👈 Fix applied

      if (request4.parameters && request4.parameters.CompanyCode) {
        delete request4.parameters.CompanyCode;
      }
      await request4
        .input("ApprovalID", sql.Int, cqtCode)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "COTTON")
        .input("subModuleName", sql.NVarChar, "Cotton Quality Test Approval")
        .execute("web_sp_Notification_Update");

      const request2 = new sql.Request(transaction);
      await request2.batch(`
        EXEC sp_CottonQualityTestApproval_Pendings
        UPDATE tbl_DashBoard 
        SET Cotton_QualityTest_Approval_Pendings = @@ROWCOUNT
      `);

      await transaction.commit();
      const isApprove = !reject && !mdReject;

      return res.status(201).json({
        success: true,
        message: isApprove
          ? "Approved Successfully!"
          : "Rejected Successfully!",
      });
    } catch (err) {
      console.log(err, 44433);
      await transaction.rollback();
      if (err.message.includes("UK_")) {
        return res
          .status(400)
          .json({ success: false, message: "Already Approved !" });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  } catch (err) {
    console.log(err, 89808);

    return res.status(500).json({ success: false, error: err.message });
  }
};

export const approveIssueLotTest = async (req, res) => {
  const {
    approvalDate,
    cqtCode,
    arrivalCode,
    grade,
    yarnType,
    remarks,
    ratePerCandy,
    reject,
    mdReject,
    companyCode,
    message,
  } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { FYCode, nodeCode, userId } = req.headers;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request1 = new sql.Request(transaction);
      applyBranchCode(request1, req.headers); // 👈 Fix applied
      const subdbname = showBranchDropDown(req.headers.subdbname);
      if (subdbname) {
        request1.input("ArrivalCode", sql.Int, arrivalCode);
      }

      let getApprovaltNo = await request1
        // .input("CompanyCode", sql.Int, parseInt(companyCode))
        .input("FYCode", sql.Int, parseInt(FYCode))
        .execute("sp_CottonLotApproval_No");

      const request2 = new sql.Request(transaction);
      applyBranchCode(request2, req.headers); // 👈 Fix applied

      await request2
        .input("CottonLotApprovalDate", sql.DateTime, new Date(approvalDate))
        .input(
          "CottonLotApprovalNo",
          sql.Int,
          getApprovaltNo.recordset[0]["LotApprovalNo"],
        )
        .input("ArrivalCode", sql.Int, arrivalCode)
        .input("Remarks", sql.NVarChar(500), remarks || null)
        .input("FYCode", sql.Int, FYCode)
        // .input("CompanyCode", sql.Int, companyCode)
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode)
        .execute("sp_CottonLotApproval_AddEdit");

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, arrivalCode)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "COTTON")
        .input("subModuleName", sql.NVarChar, "Cotton Issue Lot Approval")
        .execute("web_sp_Notification_Update");

      await request2.batch(`
        EXEC sp_CottonLotApproval_GetPendings;
        UPDATE tbl_DashBoard 
        SET Cotton_LotApproval_Pendings = @@ROWCOUNT;
      `);

      await transaction.commit();
      return res.status(201).json({
        success: true,
        message:
          reject || mdReject
            ? "Rejected Successfully!"
            : "Approved Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      if (err.message.includes("UK_")) {
        return res
          .status(400)
          .json({ success: false, message: "Already Approved !" });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const approveBillPassing = async (req, res) => {
  const { billPassingDate, arrivalCode, remarks, companyCode, isApprove } =
    req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { FYCode, nodeCode, userId } = req.headers;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      const request1 = new sql.Request(transaction);
      applyBranchCode(request1, req.headers); // 👈 Fix applied

      if (isApprove) {
        await request
          .input("BillPassingDate", sql.DateTime, new Date(billPassingDate))
          .input("ArrivalCode", sql.Int, arrivalCode)
          .input("Remarks", sql.NVarChar(500), remarks || null)
          .input("FYCode", sql.Int, FYCode)
          // .input("CompanyCode", sql.Int, companyCode)
          .input("User", sql.Int, userId)
          .input("Node", sql.Int, nodeCode)
          .execute("sp_CottonBillPassing_Insert");
      } else {
        // Need a standalone request for the GET calls, not on transaction yet
        const poolReq = pool.request();
        applyBranchCode(poolReq, req.headers); // 👈 Fix applied

        let getBales = await poolReq
          // .input("CompanyCode", sql.Int, parseInt(companyCode))
          // .input("ArrivalCode", sql.Int, parseInt(arrivalCode))
          .execute("sp_CottonReject_GetBales");

        const poolReq2 = pool.request();
        applyBranchCode(poolReq2, req.headers); // 👈 Fix applied

        let getRejectNo = await poolReq2
          // .input("CompanyCode", sql.Int, parseInt(companyCode))
          .input("FYCode", sql.Int, parseInt(FYCode))
          .execute("sp_CottonReject_No");

        const cottonReject = await request
          .input(
            "CottonRejectNo",
            sql.Int,
            getRejectNo.recordset[0]["CottonRejectNo"],
          )
          .input("CottonRejectDate", sql.DateTime, new Date(billPassingDate))
          .input("ArrivalCode", sql.Int, arrivalCode)
          .input("NoofBales", sql.Int, getBales.recordset[0].NoofBales)
          .input("Remarks", sql.NVarChar(500), remarks || null)
          .input("RejectSales", 1)
          .input("FYCode", sql.Int, FYCode)
          // .input("CompanyCode", sql.Int, companyCode)
          .input("User", sql.Int, userId)
          .input("Node", sql.Int, nodeCode)
          .execute("sp_CottonReject_AddEdit");

        await request1
          .input("CottonRejectCode", sql.Int, cottonReject.recordset[0][""])
          // .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_CottonRejectDetails_Delete");

        for (
          let rowIndex = 0;
          rowIndex < getBales.recordset.length;
          rowIndex++
        ) {
          const row = getBales.recordset[rowIndex];
          const rowRequest = new sql.Request(transaction);
          applyBranchCode(rowRequest, req.headers); // 👈 Fix applied

          await rowRequest
            .input("CottonRejectCode", sql.Int, cottonReject.recordset[0][""])
            .input("SNo", sql.Int, rowIndex + 1)
            .input("WeighmentDetailsCode", sql.Int, row.WeighmentDetailsCode)
            .input("BaleNo", sql.Int, row.BaleNo)
            .input("GrossWeight", sql.Numeric(12, 3), row.GrossWeight)
            .input("Allowance", sql.Numeric(12, 3), row.Allowance)
            .input("SampleWeight", sql.Numeric(12, 3), row.SampleWeight)
            .input("TareWeight", sql.Numeric(12, 3), row.TareWeight)
            .input("NetWeight", sql.Numeric(12, 3), row.NetWeight)
            // .input("CompanyCode", sql.Int, companyCode)
            .execute("sp_CottonRejectDetails_AddEdit");
        }
      }

      // Notification Update
      const request2 = new sql.Request(transaction);
      applyBranchCode(request2, req.headers); // 👈 Fix applied
      if (request2.parameters && request2.parameters.CompanyCode) {
        delete request2.parameters.CompanyCode;
      }
      await request2
        .input("ApprovalID", sql.Int, arrivalCode)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "COTTON")
        .input("subModuleName", sql.NVarChar, "Cotton BillPassing Approval")
        .execute("web_sp_Notification_Update");

      await request.batch(`
        EXEC sp_CottonBillPassing_Pendings 
        UPDATE tbl_DashBoard Set Cotton_BillPassing_Pendings = @@ROWCOUNT
      `);

      await transaction.commit();
      return res.status(201).json({
        success: true,
        message: isApprove
          ? "Approved Successfully!"
          : "Rejected Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      if (err.message.includes("UK_")) {
        return res
          .status(400)
          .json({ success: false, message: "Already Approved !" });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const approveAllowanceGeneration = async (req, res) => {
  const {
    approvalDate,
    arrivalCode,
    remarks,
    creditNoteNo,
    creditNoteDate,
    creditNoteAmount,
    companyCode,
    isApprove,
  } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { FYCode, nodeCode, userId } = req.headers;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied
      const request1 = new sql.Request(transaction);
      applyBranchCode(request1, req.headers); // 👈 Fix applied
      const request2 = new sql.Request(transaction);
      applyBranchCode(request2, req.headers); // 👈 Fix applied

      // Reads (outside transaction usually, or new request on pool)
      const poolReq1 = pool.request();
      applyBranchCode(poolReq1, req.headers);
      let getAllowanceNo = await poolReq1
        // .input("CompanyCode", sql.Int, parseInt(companyCode))
        .input("FYCode", sql.Int, parseInt(FYCode))
        .execute("sp_CottonAllowance_No");

      const poolReq2 = pool.request();
      applyBranchCode(poolReq2, req.headers);
      let getAllowanceKGS = await poolReq2.input(
        "ArrivalCode",
        sql.Int,
        parseInt(arrivalCode),
      ).query(`
            SELECT TotalDifferenceKG
            FROM tbl_CottonAllowance_Generation
            WHERE ArrivalCode = @ArrivalCode
        `);

      if (isApprove) {
        await request
          .input("Approval_Date", sql.DateTime, new Date(approvalDate))
          .input("ArrivalCode", sql.Int, arrivalCode)
          .input("Approval_Amount", sql.Numeric(12, 2), creditNoteAmount)
          .input("User", sql.Int, userId)
          .input("Node", sql.Int, nodeCode)
          .execute("sp_CottonAllowance_Generation_Approval_Update");

        await request1
          .input(
            "CottonAllowanceNo",
            sql.Int,
            getAllowanceNo.recordset[0]["CQTNO"],
          )
          .input("CottonAllowanceDate", sql.DateTime, new Date(approvalDate))
          .input("ArrivalCode", sql.Int, arrivalCode)
          .input(
            "AllowanceKgs",
            sql.Numeric(12, 3),
            getAllowanceKGS.recordset[0]["TotalDifferenceKG"],
          )
          .input("AllowanceCandyRate", 0)
          .input("CreditNoteNo", sql.NVarChar(50), creditNoteNo || null)
          .input(
            "CreditNoteDate",
            sql.DateTime,
            creditNoteDate != null ? new Date(creditNoteDate) : null,
          )
          .input(
            "CreditNoteAmount",
            sql.Numeric(12, 2),
            creditNoteAmount || null,
          )
          .input("Remarks", sql.NVarChar(250), remarks || null)
          .input("FYCode", sql.Int, FYCode)
          // .input("CompanyCode", sql.Int, companyCode)
          .input("User", sql.Int, userId)
          .input("Node", sql.Int, nodeCode)
          .execute("sp_CottonAllowance_AddEdit");
      } else {
        await request2
          .input("Reject_Date", sql.DateTime, new Date(approvalDate))
          .input("ArrivalCode", sql.Int, arrivalCode)
          .input("User", sql.Int, userId)
          .input("Node", sql.Int, nodeCode)
          .execute("sp_CottonAllowance_Generation_Reject_Update");
      }

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, arrivalCode)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "COTTON")
        .input("subModuleName", sql.NVarChar, "Cotton Allowance Approval")
        .execute("web_sp_Notification_Update");

      await request.batch(`
        EXEC sp_CottonAllowance_Approval_Pending 
        UPDATE tbl_DashBoard Set Cotton_AllowanceGeneration_ApprovalPendings = @@ROWCOUNT
      `);

      await transaction.commit();
      return res.status(201).json({
        success: true,
        message: isApprove
          ? "Approved Successfully!"
          : "Rejected Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      if (err.message.includes("UK_")) {
        return res
          .status(400)
          .json({ success: false, message: "Already Approved !" });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const approveRejectLot = async (req, res) => {
  const {
    CQTApprovalCode,
    approvalDate,
    CQTCode,
    arrivalCode,
    grade,
    yarnType,
    remarks,
    ratePerCandy,
    companyCode,
    isApprove,
    message,
  } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { FYCode, nodeCode, userId } = req.headers;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied
      const request2 = new sql.Request(transaction);
      applyBranchCode(request2, req.headers); // 👈 Fix applied

      await request
        .input("CQTApprovalDate", sql.DateTime, new Date(approvalDate))
        .input("CQTCode", sql.Int, CQTCode)
        .input("ArrivalCode", sql.Int, arrivalCode)
        .input("Grade", sql.NVarChar(50), grade)
        .input("Remarks", sql.NVarChar(200), remarks || null)
        .input("RatePerCandy", sql.Numeric(12, 2), ratePerCandy)
        .input("Reject", isApprove ? 0 : 1)
        .input("MD_Reject", isApprove ? 0 : 1)
        .input("FYCode", sql.Int, FYCode)
        // .input("CompanyCode", sql.Int, companyCode)
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode)
        .execute("sp_CottonQualityTestApproval_AddEdit");

      await request2
        .input("Grade", sql.NVarChar(500), grade || null)
        // .input("CompanyCode", sql.Int, companyCode)
        .input("CQTCode", sql.Int, CQTCode).query(`
            UPDATE tbl_CottonQualityTest
            SET Grade = @Grade
            WHERE CompanyCode = @CompanyCode AND CQTCode = @CQTCode
        `);

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, CQTCode)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "COTTON")
        .input("subModuleName", sql.NVarChar, "Cotton Reject Lot Approval")
        .execute("web_sp_Notification_Update");

      await request.batch(`
        EXEC sp_CottonQualityTestApproval_Pendings_MD
        UPDATE tbl_DashBoard Set Cotton_RejectLot_Approval_Pendings = @@ROWCOUNT
      `);

      await transaction.commit();
      return res.status(201).json({
        success: true,
        message: isApprove
          ? "Approved Successfully!"
          : "Rejected Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      if (err.message.includes("UK_")) {
        return res
          .status(400)
          .json({ success: false, message: "Already Approved !" });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ************** OVERVIEWS **************

export const getPurchaseOrderOverview = async (req, res) => {
  try {
    const paramData = req.query;
    const paramId = req.params;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    // Main Result
    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("CPOCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_CottonPurchaseOrder_GetAll");

    // Detailed Result
    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("CPOCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_CottonPurchaseOrderDetails_GetAll");

    const addId = Object.assign({
      ...mainResult?.recordsets?.[0]?.[0],
      id: mainResult?.recordsets?.[0]?.[0]?.CPOCode,
    });

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
    console.log("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getQualityTestOverview = async (req, res) => {
  try {
    const paramData = req.query;
    const paramId = req.params;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("CQTCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_CottonQualityTest_GetAll");

    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("CQTCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_CottonQualityTestDetails_GetAll");

    const addId = Object.assign({
      ...mainResult?.recordsets?.[0]?.[0],
      id: mainResult?.recordsets?.[0]?.[0]?.CQTCode,
    });

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

export const getIssueLotOverview = async (req, res) => {
  try {
    const paramData = req.query;
    const paramId = req.params;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    applyBranchCode(request, req.headers); // 👈 Fix applied

    // Dynamic Query Construction
    let query = `
        SELECT ArrivalDate, SupplierName, AgentName, RawMaterialName, StationName, Qty, TotalNetWeight, ArrivalCode
        FROM vw_CottonWeighment
        WHERE ArrivalCode = @ArrivalCode
    `;

    // Add BranchCode filter to query if it exists
    if (req.headers["branchCode"] || req.headers["branchcode"]) {
      query += " AND BranchCode = @BranchCode";
    }

    const result = await request
      .input("ArrivalCode", sql.Int, parseInt(paramId?.id))
      .query(query);

    const totalRecords = result?.recordset?.length || 0;
    const addId = Object.assign({
      ...result.recordset?.[0],
      id: result.recordset?.[0]?.ArrivalCode,
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

export const getBillPassingOverview = async (req, res) => {
  try {
    const paramData = req.query;
    const paramId = req.params;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    let mainResult, detailedResult;

    if (
      req.headers.subdbname === "KAS"
      //  ||
      // req.headers.subdbname === "LOCALHOST"
    ) {
      const req1 = pool.request();
      applyBranchCode(req1, req.headers); // 👈 Fix applied
      mainResult = await req1
        .input("ArrivalCode", sql.Int, parseInt(paramId?.id))
        .execute("web_sp_CottonPayment_BillPassing_Load");

      const req2 = pool.request();
      applyBranchCode(req2, req.headers); // 👈 Fix applied
      detailedResult = await req2
        .input("ArrivalCode", sql.Int, parseInt(paramId?.id))
        .execute("web_sp_CottonQualityTestDetails_GetAll");
    } else {
      const req1 = pool.request();
      applyBranchCode(req1, req.headers); // 👈 Fix applied
      mainResult = await req1
        .input("ArrivalCode", sql.Int, parseInt(paramId?.id))
        .execute("web_sp_CottonWeighment_ApprovalDetails_GetAll");

      const req2 = pool.request();
      applyBranchCode(req2, req.headers); // 👈 Fix applied
      detailedResult = await req2
        .input("ArrivalCode", sql.Int, parseInt(paramId?.id))
        .execute("web_sp_CottonWeighment_ApprovalDetails_GetAll");
    }

    const addId = Object.assign({
      ...mainResult?.recordsets?.[0]?.[0],
      id: mainResult?.recordsets?.[0]?.[0]?.ArrivalCode,
    });

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
    console.error("DB Error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

export const getAllowanceGenerationOverview = async (req, res) => {
  try {
    const paramData = req.query;
    const paramId = req.params;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    const request = pool.request();
    applyBranchCode(request, req.headers); // 👈 Fix applied
    let mainResult = await request
      .input("ArrivalCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_CottonAllowance_Generation_GetAll");

    const totalRecords = mainResult?.recordset?.length || 0;
    const addId = Object.assign({
      ...mainResult.recordset?.[0],
      id: mainResult.recordset?.[0]?.ArrivalCode,
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

export const getRejectLotOverview = async (req, res) => {
  try {
    const paramData = req.query;
    const paramId = req.params;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainOutput = await req1
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("CQTCode", sql.Int, parseInt(paramId?.id))
      .execute("sp_CottonQualityTestApproval_Pendings_MD");

    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    const result = await req2.input("CQTCode", sql.Int, parseInt(paramId?.id))
      .query(`
        SELECT *
        FROM vw_CottonQualityTestDetails
        WHERE CQTCode = @CQTCode
      `);

    const totalRecords = result?.rowsAffected?.[0] || 0;
    const addId = Object.assign({
      ...mainOutput?.recordsets?.[0]?.[0],
      id: mainOutput?.recordsets?.[0]?.[0]?.CQTCode,
    });

    const paginatedData = result?.recordset?.slice(offset, offset + pageSize);
    const outputData = {
      mainOutput: addId,
      detailedOutput: paginatedData,
    };

    res.status(200).json({
      totalRecords,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(totalRecords / pageSize),
      data: outputData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};
