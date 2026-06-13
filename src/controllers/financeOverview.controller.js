// import sql from "mssql";
// import { formatDate } from "../utils/common.js";
// import { getPool } from "../config/dynamicDB.js";

// export const financeAdvanceReqApprovalStage1 = async (req, res) => {
//   const { id, companyCode, remarks, reject } = req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const FYCode = req.headers.FYCode;
//     const nodeCode = req.headers.nodeCode;
//     const userId = req.headers.userId;

//     // ✅ Transaction start
//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       // ✅ Step 1: Update Approval or Rejection
//       const request = new sql.Request(transaction);
//       request
//         .input("AdvanceRequisitionCode", sql.Int, id)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("Remarks", sql.NVarChar(500), remarks || null)
//         .input("Reject", sql.Bit, reject);
//       // .input("User", sql.Int, userId)
//       // .input("Node", sql.Int, nodeCode)
//       // .input("FYCode", sql.Int, FYCode);

//       if (reject === 1) {
//         // Reject case
//         await request.query(`
//           UPDATE tbl_AdvanceRequisition
//           SET
//             Approval_Stage1_Reject = 1,
//             Approval_Stage1_Reject_Date = GETDATE(),
//             Approval_Stage1_Remarks = @Remarks
//           WHERE CompanyCode = @CompanyCode
//             AND AdvanceRequisitionCode = @AdvanceRequisitionCode
//         `);
//       } else {
//         // Approve case
//         await request.query(`
//           UPDATE tbl_AdvanceRequisition
//           SET
//             Approval_Stage1 = 1,
//             Approval_Date1 = GETDATE(),
//             Approval_Stage1_Remarks = @Remarks
//           WHERE CompanyCode = @CompanyCode
//             AND AdvanceRequisitionCode = @AdvanceRequisitionCode
//         `);
//       }

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "FINANCE")
//         .input("subModuleName", sql.NVarChar, "Finance Advance Request Approval 1")
//         .execute("web_sp_Notification_Update");

//       // ✅ Step 2: Update dashboard counts
//       const request2 = new sql.Request(transaction);
//       await request2.batch(`
//         EXEC sp_AdvanceRequisitionApproval_Stage1_Pending  @CompanyCode = ${companyCode}
//         UPDATE tbl_DashBoard
//         SET AdvancePaymentRequisitionApprovalStage1 = @@ROWCOUNT;
//       `);

//       // ✅ Commit transaction
//       await transaction.commit();

//       const isApproved = reject !== 1;

//       return res.status(200).json({
//         success: true,
//         message: isApproved
//           ? "Finance Advance Request Approved Successfully!"
//           : "Finance Advance Request Rejected Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();

//       if (err.message.includes("UK_")) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Already processed!" });
//       }

//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Finance Advance Requisition Approval failed.",
//       });
//     }
//   } catch (err) {
//     console.error("Outer Error:", err);
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const financeAdvanceReqApprovalStage2 = async (req, res) => {
//   const { id, companyCode, remarks, reject } = req.body;

//   try {
//       if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const FYCode = req.headers.FYCode;
//     const nodeCode = req.headers.nodeCode;
//     const userId = req.headers.userId;

//     // ✅ Transaction start
//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       // ✅ Step 1: Update Approval or Rejection
//       const request = new sql.Request(transaction);
//       request
//         .input("AdvanceRequisitionCode", sql.Int, id)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("Remarks", sql.NVarChar(500), remarks || null)
//         .input("Reject", sql.Bit, reject);
//       // .input("User", sql.Int, userId)
//       // .input("Node", sql.Int, nodeCode)
//       // .input("FYCode", sql.Int, FYCode);

//       if (reject === 1) {
//         // Reject case
//         await request.query(`
//         UPDATE tbl_AdvanceRequisition
//         SET
//           Approval_Stage2_Reject = 1,
//           Approval_Stage2_Reject_Date = GETDATE(),
//           Approval_Stage2_Remarks = @Remarks
//         WHERE CompanyCode = @CompanyCode
//           AND AdvanceRequisitionCode = @AdvanceRequisitionCode
//       `);
//       } else {
//         // Approve case
//         await request.query(`
//         UPDATE tbl_AdvanceRequisition
//         SET
//           Approval_Stage2 = 1,
//           Approval_Date2 = GETDATE(),
//           Approval_Stage2_Remarks = @Remarks
//         WHERE CompanyCode = @CompanyCode
//           AND AdvanceRequisitionCode = @AdvanceRequisitionCode
//       `);
//       }

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "FINANCE")
//         .input("subModuleName", sql.NVarChar, "Finance Advance Request Approval 2")
//         .execute("web_sp_Notification_Update");

//       // ✅ Step 2: Update dashboard counts
//       const request2 = new sql.Request(transaction);
//       await request2.batch(`
//         EXEC sp_AdvanceRequisitionApproval_Stage2_Pending  @CompanyCode = ${companyCode}
//         UPDATE tbl_DashBoard
//         SET AdvancePaymentRequisitionApprovalStage2 = @@ROWCOUNT;
//       `);

//       // ✅ Commit transaction
//       await transaction.commit();

//       const isApproved = reject !== 1;

//       return res.status(200).json({
//         success: true,
//         message: isApproved
//           ? "Finance Advance Request Approved Successfully!"
//           : "Finance Advance Request Rejected Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();

//       if (err.message.includes("UK_")) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Already processed!" });
//       }

//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Finance Advance Requisition Approval failed.",
//       });
//     }
//   } catch (err) {
//     console.error("Outer Error:", err);
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const paymentApproval = async (req, res) => {
//   const { paymentDate, id, UTRNo, remarks, companyCode, reject } = req.body;

//   const FYCode = req.headers.fycode || req.headers.FYCode;
//   const nodeCode = req.headers.nodeCode;
//   const userId = req.headers.userId;

//   try {
//         if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       // ✅ Step 1: Common stored procedure - sp_PaymentApproval_AddEdit
//       const request = new sql.Request(transaction);
//       request.input("PaymentApprovalDate", sql.DateTime, paymentDate);
//       request.input("PaymentCode", sql.Int, id);
//       request.input("CompanyCode", sql.Int, companyCode);
//       request.input("Remarks", sql.VarChar, remarks || "");
//       request.input("User", sql.Int, userId);
//       request.input("Node", sql.Int, nodeCode);

//       if (reject === 0) {
//         // ✅ APPROVE
//         request.input("UTRNo", sql.VarChar, UTRNo || "");
//         await request.execute("sp_PaymentApproval_AddEdit");

//         // ✅ Step 2: Check tbl_Setting for PaymentApproval_PostDate_Payment
//         const settingCheck = await transaction.request().query(
//           `SELECT PaymentApproval_PostDate_Payment
//              FROM tbl_Setting
//              WHERE PaymentApproval_PostDate_Payment = 1`
//         );

//         if (settingCheck.recordset.length > 0) {
//           await transaction
//             .request()
//             .input("PaymentDate", sql.DateTime, paymentDate)
//             .query(
//               `UPDATE tbl_Payment
//                SET PaymentDate = @PaymentDate
//                WHERE PaymentCode = '${id}'`
//             );
//         }
//       } else {
//         // ✅ REJECT
//         await request.execute("sp_PaymentApproval_AddEdit");

//         // ✅ Step 3: Call sp_Payment_Cancel
//         const cancelReq = new sql.Request(transaction);
//         cancelReq.input("PaymentCode", sql.VarChar, id);
//         cancelReq.input("CompanyCode", sql.VarChar, companyCode);
//         await cancelReq.execute("sp_Payment_Cancel");

//         // ✅ Step 4: Auto-cancel related tables if setting enabled
//         const rejectSetting = await transaction.request().query(
//           `SELECT Payment_Reject_AutoCancel_Po
//              FROM tbl_Setting
//              WHERE Payment_Reject_AutoCancel_Po = 1`
//         );

//         if (rejectSetting.recordset.length > 0) {
//           await transaction.request().query(`
//             UPDATE tbl_PurchaseAdvice SET Reject = 1 WHERE PaymentCode = '${id}';
//             UPDATE tbl_PurchaseAdviceApprove SET Reject = 1 WHERE PaymentCode = '${id}';
//             UPDATE tbl_PurchaseOrderDetails SET PO_Close = 1 WHERE PaymentCode = '${id}';
//           `);
//         }
//       }

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "FINANCE")
//         .input("subModuleName", sql.NVarChar, "Finance Payment Approval")
//         .execute("web_sp_Notification_Update");

//       await transaction.commit();

//       return res.status(200).json({
//         success: true,
//         message:
//           reject === 1
//             ? "Payment rejected successfully."
//             : "Payment approved successfully.",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Error in paymentApproval transaction:", err);
//       return res.status(500).json({ success: false, message: err.message });
//     }
//   } catch (err) {
//     console.error("DB Connection Error:", err);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// };

// export const receiptApprovalOne = async (req, res) => {
//   const { id, companyCode, remarks, reject, receiptApprovalDate } = req.body;

//   try {
//        if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const userId = req.headers.userId;
//     const nodeCode = req.headers.nodeCode;
//     const FYCode = req.headers.FYCode;

//     // ✅ Start transaction
//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);

//       // Common inputs
//       request
//         .input("ReceiptCode", sql.Int, id)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode);

//       if (reject === 1) {
//         // ❌ REJECT RECEIPT
//         if (!remarks || remarks.trim() === "") {
//           return res.status(400).json({
//             success: false,
//             message: "Remarks are required when rejecting a receipt.",
//           });
//         }

//         await request.execute("sp_Receipt_Delete");
//       } else {
//         // ✅ APPROVE RECEIPT
//         request.input("Remarks", sql.NVarChar(500), remarks || null);
//         request.input(
//           "ReceiptApprovalDate",
//           sql.DateTime,
//           receiptApprovalDate || new Date()
//         );
//         await request.execute("sp_ReceiptApproval_AddEdit");
//       }

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "FINANCE")
//         .input("subModuleName", sql.NVarChar, "Finance Receipt Approval 1")
//         .execute("web_sp_Notification_Update");

//       const postRequest = new sql.Request(pool);
//       await postRequest.batch(`
//         EXEC sp_ReceiptAppoval_GetPendings @CompanyCode = ${companyCode}
//         UPDATE tbl_DashBoard
//         SET Finance_Receipt_Approval_Stage1 = @@ROWCOUNT
//       `);

//        // ✅ Commit transaction
//       await transaction.commit();

//       const isApproved = reject !== 1;

//       return res.status(200).json({
//         success: true,
//         message: isApproved
//           ? "Receipt Approved Successfully!"
//           : "Receipt Rejected Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();

//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Receipt Approval Transaction Failed.",
//       });
//     }
//   } catch (err) {
//     console.error("Outer Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: err.message || "Receipt Approval Failed.",
//     });
//   }
// };

// export const receiptApprovalTwo = async (req, res) => {
//   const { id, companyCode, remarks, reject, receiptApprovalDate } = req.body;

//   try {
//        if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const userId = req.headers.userId;
//     const nodeCode = req.headers.nodeCode;
//     const FYCode = req.headers.FYCode;

//     // ✅ Start transaction
//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);

//       // Common inputs
//       request
//         .input("ReceiptCode", sql.Int, id)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode);

//       if (reject === 1) {
//         request.input("Del_Remarks", sql.NVarChar(500), remarks || null);
//         if (!remarks || remarks.trim() === "") {
//           return res.status(400).json({
//             success: false,
//             message: "Remarks are required when rejecting a receipt.",
//           });
//         }

//         await request.execute("sp_ReceiptApproval_Delete");
//       } else {
//         // ✅ APPROVE RECEIPT
//         request.input("Remarks", sql.NVarChar(500), remarks || null);
//         request.input(
//           "ReceiptApprovalDate",
//           sql.DateTime,
//           receiptApprovalDate || new Date()
//         );
//         await request.execute("sp_ReceiptApproval_Final_AddEdit");
//       }

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "FINANCE")
//         .input("subModuleName", sql.NVarChar, "Finance Receipt Approval 2")
//         .execute("web_sp_Notification_Update");

//       const postRequest = new sql.Request(pool);
//       await postRequest.batch(`
//         EXEC sp_ReceiptAppoval_Final_GetPendings @CompanyCode = ${companyCode}
//         UPDATE tbl_DashBoard
//         SET Finance_Receipt_Approval_Stage2 = @@ROWCOUNT
//       `);

//       // ✅ Commit transaction
//       await transaction.commit();

//       const isApproved = reject !== 1;

//       return res.status(200).json({
//         success: true,
//         message: isApproved
//           ? "Receipt Approved Successfully!"
//           : "Receipt Rejected Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();

//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Receipt Approval Transaction Failed.",
//       });
//     }
//   } catch (err) {
//     console.error("Outer Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: err.message || "Receipt Approval Failed.",
//     });
//   }
// };

// export const creditNoteApproval = async (req, res) => {
//   const { id, companyCode, remarks, reject, creditNoteApprovalDate } = req.body;

//   try {
//         if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const userId = req.headers.userId;
//     const nodeCode = req.headers.nodeCode;
//     const FYCode = req.headers.FYCode;

//     // ✅ Start transaction
//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);

//       // Common inputs
//       request
//         .input("CreditNoteCode", sql.Int, id)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode);

//       if (reject === 1) {
//         // ✅ REJECT FLOW
//         request.input(
//           "CreditNoteApprovalDate",
//           sql.DateTime,
//           creditNoteApprovalDate || new Date()
//         );
//         request.input("Remarks", sql.NVarChar(500), remarks || null);
//         request.input("Reject", sql.Int, 1);

//         if (!remarks || remarks.trim() === "") {
//           return res.status(400).json({
//             success: false,
//             message: "Remarks are required when rejecting a credit note.",
//           });
//         }

//         await request.execute("sp_CreditNoteApproval_AddEdit");

//         // Optional: Call specific reject stored procedure if needed
//         const rejectRequest = new sql.Request(transaction);
//         rejectRequest
//           .input("CreditNoteCode", sql.Int, id)
//           .input("CompanyCode", sql.Int, companyCode);
//         await rejectRequest.execute("sp_CreditNote_Reject");
//       } else {
//         // ✅ APPROVE FLOW
//         request.input(
//           "CreditNoteApprovalDate",
//           sql.DateTime,
//           creditNoteApprovalDate || new Date()
//         );
//         request.input("Remarks", sql.NVarChar(500), remarks || null);
//         request.input("Reject", sql.Int, 0);

//         await request.execute("sp_CreditNoteApproval_AddEdit");
//       }

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "FINANCE")
//         .input("subModuleName", sql.NVarChar, "Finance Credit Note Approval")
//         .execute("web_sp_Notification_Update");

//       const postRequest = new sql.Request(pool);
//       await postRequest.batch(`
//         EXEC sp_CreditNoteAppoval_GetPendings
//         UPDATE tbl_DashBoard
//         SET Finance_CreditNote_Approval_Pendings = @@ROWCOUNT
//       `);

//       // ✅ Commit transaction
//       await transaction.commit();

//       return res.status(200).json({
//         success: true,
//         message:
//           reject === 1
//             ? "Credit Note Rejected Successfully!"
//             : "Credit Note Approved Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Credit Note Approval Transaction Failed.",
//       });
//     }
//   } catch (err) {
//     console.error("Outer Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: err.message || "Credit Note Approval Failed.",
//     });
//   }
// };

// export const debitNoteApproval = async (req, res) => {
//   const { id, companyCode, remarks, reject, debitNoteApprovalDate } = req.body;

//   try {
//         if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const userId = req.headers.userId;
//     const nodeCode = req.headers.nodeCode;
//     const FYCode = req.headers.FYCode;

//     // ✅ Start transaction
//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);

//       // Common inputs
//       request
//         .input("DebitNoteCode", sql.Int, id)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode);

//       if (reject === 1) {
//         // ✅ REJECT FLOW
//         request.input(
//           "DebitNoteApprovalDate",
//           sql.DateTime,
//           debitNoteApprovalDate || new Date()
//         );
//         request.input("Remarks", sql.NVarChar(500), remarks || null);
//         request.input("Reject", sql.Int, 1);

//         if (!remarks || remarks.trim() === "") {
//           return res.status(400).json({
//             success: false,
//             message: "Remarks are required when rejecting a debit note.",
//           });
//         }

//         await request.execute("sp_DebitNoteApproval_AddEdit");

//         // Optional: Call specific reject stored procedure
//         const rejectRequest = new sql.Request(transaction);
//         rejectRequest
//           .input("DebitNoteCode", sql.Int, id)
//           .input("CompanyCode", sql.Int, companyCode);
//         await rejectRequest.execute("sp_DebitNote_Reject");
//       } else {
//         // ✅ APPROVE FLOW
//         request.input(
//           "DebitNoteApprovalDate",
//           sql.DateTime,
//           debitNoteApprovalDate || new Date()
//         );
//         request.input("Remarks", sql.NVarChar(500), remarks || null);
//         request.input("Reject", sql.Int, 0);

//         await request.execute("sp_DebitNoteApproval_AddEdit");
//       }

//    // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "FINANCE")
//         .input("subModuleName", sql.NVarChar, "Finance Debit Note Approval")
//         .execute("web_sp_Notification_Update");

//       const postRequest = new sql.Request(pool);
//       await postRequest.batch(`
//         EXEC sp_DebitNoteAppoval_GetPendings
//         UPDATE tbl_DashBoard
//         SET Finance_DebitNote_Approval_Pendings = @@ROWCOUNT
//       `);

//          // ✅ Commit transaction
//       await transaction.commit();

//       return res.status(200).json({
//         success: true,
//         message:
//           reject === 1
//             ? "Debit Note Rejected Successfully!"
//             : "Debit Note Approved Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Debit Note Approval Transaction Failed.",
//       });
//     }
//   } catch (err) {
//     console.error("Outer Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: err.message || "Debit Note Approval Failed.",
//     });
//   }
// };

// // Get list function

// export const getReceipt1Overview = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const paramId = req.params;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // Connect to the database
//        if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let mainResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("ReceiptCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_Receipt_GetAll");

//     const totalRecords = mainResult?.recordset?.length || 0;
//     const addId = Object.assign({
//       ...mainResult.recordset?.[0],
//       id: mainResult.recordset?.[0]?.AdvanceRequisitionCode,
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

// export const getAdvPaymentApprove1Overview = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const paramId = req.params;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // Connect to the database
//        if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let mainResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("AdvanceRequisitionCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_AdvanceRequisition_GetAll");

//     const totalRecords = mainResult?.recordset?.length || 0;
//     const addId = Object.assign({
//       ...mainResult.recordset?.[0],
//       id: mainResult.recordset?.[0]?.AdvanceRequisitionCode,
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

// export const getAdvPaymentApprove2Overview = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const paramId = req.params;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // Connect to the database
//         if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let mainResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("AdvanceRequisitionCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_AdvanceRequisition_GetAll");

//     const totalRecords = mainResult?.recordset?.length || 0;
//     const addId = Object.assign({
//       ...mainResult.recordset?.[0],
//       id: mainResult.recordset?.[0]?.AdvanceRequisitionCode,
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

// export const getPaymentApproveOverview = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const paramId = req.params;
//     const FYEnd = req.headers.FYEnd;

//     // Utility to parse and format FYEnd date properly
//     const toDate = new Date(FYEnd);
//     if (isNaN(toDate.getTime())) {
//       return res.status(400).json({ error: "Invalid FYEnd date in headers" });
//     }

//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // Connect to the database
//         if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Fetch detailedResult first for SupplierCode extraction
//     let detailedResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("PaymentCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_PaymentDetails_GetAll");

//     // Fetch leaderResult using SupplierCode from detailedResult (if available)
//     let leaderResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("FromDate", sql.DateTime, new Date(paramData?.fromDate))
//       .input("ToDate", sql.DateTime, toDate)
//       .input(
//         "SupplierCode",
//         sql.Int,
//         parseInt(detailedResult?.recordset?.[0]?.SupplierCode) || 0
//       )
//       .input("Cotton", sql.Int, parseInt(paramData?.cotton) || 0)
//       .input("Stores", sql.Int, parseInt(paramId?.stores) || 0)
//       .input("Cotton_Freight", sql.Int, parseInt(paramId?.cottonFreight) || 0)
//       .input(
//         "TRANSPORT_FREIGHT",
//         sql.Int,
//         parseInt(paramId?.transportFreight) || 0
//       )
//       .input(
//         "YARN_AGENT_COMMISSION",
//         sql.Int,
//         parseInt(paramId?.yanAgentCommission) || 0
//       )
//       .input("SERVICE_ORDER", sql.Int, parseInt(paramId?.serviceOrder) || 0)
//       .input(
//         "LABOUR_AGENT_COMMISSION",
//         sql.Int,
//         parseInt(paramId?.labourAgentCommision) || 0
//       )
//       .input("YARN_PURCHASE", sql.Int, parseInt(paramId?.yarnPurchese) || 0)
//       .execute("sp_Supplier_Ledger_Generate");

//     // Fetch mainResult
//     let mainResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("PaymentCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_PaymentDetails_GetLedger");

//     const mainOutput = mainResult?.recordset || [];

//     // Function to derive dynamic RefCode order from data
//     function getDynamicOrderFromData(data) {
//       const seen = new Set();
//       return data.reduce((order, item) => {
//         if (!seen.has(item.RefCode)) {
//           seen.add(item.RefCode);
//           order.push(item.RefCode);
//         }
//         return order;
//       }, []);
//     }

//     // Function to sort by dynamic order array for a given key
//     function sortByDynamicOrder(array, orderArray, key) {
//       return array.sort((a, b) => {
//         const aIndex = orderArray.indexOf(a[key]);
//         const bIndex = orderArray.indexOf(b[key]);

//         const aRank = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
//         const bRank = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;

//         return aRank - bRank;
//       });
//     }

//     // Get dynamic order from mainOutput
//     const dynamicOrder = getDynamicOrderFromData(mainOutput);

//     // Add 'id' field and sort mainOutput dynamically by RefCode order
//     const updatedSortedMainOutput = sortByDynamicOrder(
//       mainOutput.map((item) => ({ ...item, id: item.PaymentCode })),
//       dynamicOrder,
//       "RefCode"
//     );

//     // Apply pagination manually on detailedResult
//     const paginatedData = detailedResult?.recordset?.slice(
//       offset,
//       offset + pageSize
//     );

//     // Prepare output
//     const outputData = {
//       mainOutput: updatedSortedMainOutput,
//       detailedOutput: paginatedData,
//     };

//     res.status(200).json({
//       totalRecords: detailedResult?.recordset.length || 0,
//       currentPage: page,
//       pageSize: pageSize,
//       totalPages: Math.ceil((detailedResult?.recordset.length || 0) / pageSize),
//       data: outputData,
//     });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const creditNoteDetailsOverview = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const paramId = req.params;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // Connect to the database
//         if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let detailedResult = await pool
//       .request()
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("CreditNoteCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_CreditNoteDetails_GetAll");

//     // Apply pagination manually
//     const paginatedData = detailedResult?.recordset?.slice(
//       offset,
//       offset + pageSize
//     );
//     const outputData = {
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

// export const debitNoteDetailsOverview = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const paramId = req.params;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // Connect to the database
//         if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let detailedResult = await pool
//       .request()
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("DebitNoteCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_DebitNoteDetails_GetAll");

//     // Apply pagination manually
//     const paginatedData = detailedResult?.recordset?.slice(
//       offset,
//       offset + pageSize
//     );
//     const outputData = {
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

// // 13 functions

import sql from "mssql";
import { applyBranchCode, formatDate } from "../utils/common.js";
import { getPool } from "../config/dynamicDB.js";

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

export const financeAdvanceReqApprovalStage1 = async (req, res) => {
  const { id, companyCode, remarks, reject } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { FYCode, nodeCode, userId } = req.headers;

    // ✅ Transaction start
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // ✅ Step 1: Update Approval or Rejection
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      request
        .input("AdvanceRequisitionCode", sql.Int, id)
        // .input("CompanyCode", sql.Int, companyCode)
        .input("Remarks", sql.NVarChar(500), remarks || null)
        .input("Reject", sql.Bit, reject);

      if (reject === 1) {
        // Reject case
        await request.query(`
          UPDATE tbl_AdvanceRequisition
          SET 
            Approval_Stage1_Reject = 1,
            Approval_Stage1_Reject_Date = GETDATE(),
            Approval_Stage1_Remarks = @Remarks
          WHERE CompanyCode = @CompanyCode
            AND AdvanceRequisitionCode = @AdvanceRequisitionCode
        `);
      } else {
        // Approve case
        await request.query(`
          UPDATE tbl_AdvanceRequisition
          SET 
            Approval_Stage1 = 1,
            Approval_Date1 = GETDATE(),
            Approval_Stage1_Remarks = @Remarks
          WHERE CompanyCode = @CompanyCode
            AND AdvanceRequisitionCode = @AdvanceRequisitionCode
        `);
      }

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "FINANCE")
        .input(
          "subModuleName",
          sql.NVarChar,
          "Finance Advance Request Approval 1",
        )
        .execute("web_sp_Notification_Update");

      // ✅ Step 2: Update dashboard counts
      const request2 = new sql.Request(transaction);
      applyBranchCode(request2, req.headers); // 👈 Fix applied
      await request2.batch(`
        EXEC sp_AdvanceRequisitionApproval_Stage1_Pending  @CompanyCode = ${companyCode}
        UPDATE tbl_DashBoard
        SET AdvancePaymentRequisitionApprovalStage1 = @@ROWCOUNT;
      `);

      // ✅ Commit transaction
      await transaction.commit();

      const isApproved = reject !== 1;

      return res.status(200).json({
        success: true,
        message: isApproved
          ? "Finance Advance Request Approved Successfully!"
          : "Finance Advance Request Rejected Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      if (err.message.includes("UK_")) {
        return res
          .status(400)
          .json({ success: false, message: "Already processed!" });
      }
      console.error("Transaction Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Finance Advance Requisition Approval failed.",
      });
    }
  } catch (err) {
    console.error("Outer Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const financeAdvanceReqApprovalStage2 = async (req, res) => {
  const { id, companyCode, remarks, reject } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { FYCode, nodeCode, userId } = req.headers;

    // ✅ Transaction start
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // ✅ Step 1: Update Approval or Rejection
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      request
        .input("AdvanceRequisitionCode", sql.Int, id)
        // .input("CompanyCode", sql.Int, companyCode)
        .input("Remarks", sql.NVarChar(500), remarks || null)
        .input("Reject", sql.Bit, reject);

      if (reject === 1) {
        // Reject case
        await request.query(`
        UPDATE tbl_AdvanceRequisition
        SET
          Approval_Stage2_Reject = 1,
          Approval_Stage2_Reject_Date = GETDATE(),
          Approval_Stage2_Remarks = @Remarks
        WHERE CompanyCode = @CompanyCode
          AND AdvanceRequisitionCode = @AdvanceRequisitionCode
      `);
      } else {
        // Approve case
        await request.query(`
        UPDATE tbl_AdvanceRequisition
        SET
          Approval_Stage2 = 1,
          Approval_Date2 = GETDATE(),
          Approval_Stage2_Remarks = @Remarks
        WHERE CompanyCode = @CompanyCode
          AND AdvanceRequisitionCode = @AdvanceRequisitionCode
      `);
      }

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      await request3
        .input("ApprovalID", sql.Int, id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "FINANCE")
        .input(
          "subModuleName",
          sql.NVarChar,
          "Finance Advance Request Approval 2",
        )
        .execute("web_sp_Notification_Update");

      // ✅ Step 2: Update dashboard counts
      const request2 = new sql.Request(transaction);
      applyBranchCode(request2, req.headers); // 👈 Fix applied
      if (request2.parameters && request2.parameters.CompanyCode) {
        delete request2.parameters.CompanyCode;
      }
      await request2.batch(`
        EXEC sp_AdvanceRequisitionApproval_Stage2_Pending  @CompanyCode = ${companyCode}
        UPDATE tbl_DashBoard
        SET AdvancePaymentRequisitionApprovalStage2 = @@ROWCOUNT;
      `);

      // ✅ Commit transaction
      await transaction.commit();

      const isApproved = reject !== 1;

      return res.status(200).json({
        success: true,
        message: isApproved
          ? "Finance Advance Request Approved Successfully!"
          : "Finance Advance Request Rejected Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      if (err.message.includes("UK_")) {
        return res
          .status(400)
          .json({ success: false, message: "Already processed!" });
      }
      console.error("Transaction Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Finance Advance Requisition Approval failed.",
      });
    }
  } catch (err) {
    console.error("Outer Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const paymentApproval = async (req, res) => {
  const { paymentDate, id, UTRNo, remarks, companyCode, reject } = req.body;
  const { fycode, FYCode, nodeCode, userId } = req.headers;
  const activeFYCode = fycode || FYCode;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // ✅ Step 1: Common stored procedure - sp_PaymentApproval_AddEdit
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      request.input("PaymentApprovalDate", sql.DateTime, paymentDate);
      request.input("PaymentCode", sql.Int, id);
      // request.input("CompanyCode", sql.Int, companyCode);
      request.input("Remarks", sql.VarChar, remarks || "");
      request.input("User", sql.Int, userId);
      request.input("Node", sql.Int, nodeCode);

      if (reject === 0) {
        // ✅ APPROVE
        request.input("UTRNo", sql.VarChar, UTRNo || "");
        await request.execute("sp_PaymentApproval_AddEdit");

        // ✅ Step 2: Check tbl_Setting for PaymentApproval_PostDate_Payment
        const settingCheck = await transaction.request().query(
          `SELECT PaymentApproval_PostDate_Payment 
             FROM tbl_Setting 
             WHERE PaymentApproval_PostDate_Payment = 1`,
        );

        if (settingCheck.recordset.length > 0) {
          await transaction
            .request()
            .input("PaymentDate", sql.DateTime, paymentDate)
            .query(
              `UPDATE tbl_Payment 
               SET PaymentDate = @PaymentDate 
               WHERE PaymentCode = '${id}'`,
            );
        }
      } else {
        // ✅ REJECT
        await request.execute("sp_PaymentApproval_AddEdit");

        // ✅ Step 3: Call sp_Payment_Cancel
        const cancelReq = new sql.Request(transaction);
        applyBranchCode(cancelReq, req.headers); // 👈 Fix applied
        cancelReq.input("PaymentCode", sql.VarChar, id);
        cancelReq.input("CompanyCode", sql.VarChar, companyCode);
        await cancelReq.execute("sp_Payment_Cancel");

        // ✅ Step 4: Auto-cancel related tables if setting enabled
        const rejectSetting = await transaction.request().query(
          `SELECT Payment_Reject_AutoCancel_Po 
             FROM tbl_Setting 
             WHERE Payment_Reject_AutoCancel_Po = 1`,
        );

        if (rejectSetting.recordset.length > 0) {
          await transaction.request().query(`
            UPDATE tbl_PurchaseAdvice SET Reject = 1 WHERE PaymentCode = '${id}';
            UPDATE tbl_PurchaseAdviceApprove SET Reject = 1 WHERE PaymentCode = '${id}';
            UPDATE tbl_PurchaseOrderDetails SET PO_Close = 1 WHERE PaymentCode = '${id}';
          `);
        }
      }

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "FINANCE")
        .input("subModuleName", sql.NVarChar, "Finance Payment Approval")
        .execute("web_sp_Notification_Update");

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message:
          reject === 1
            ? "Payment rejected successfully."
            : "Payment approved successfully.",
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Error in paymentApproval transaction:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  } catch (err) {
    console.error("DB Connection Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const receiptApprovalOne = async (req, res) => {
  const { id, companyCode, remarks, reject, receiptApprovalDate } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { userId, nodeCode, FYCode } = req.headers;

    // ✅ Start transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      // Common inputs
      request
        .input("ReceiptCode", sql.Int, id)
        // .input("CompanyCode", sql.Int, companyCode)
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode);

      if (reject === 1) {
        // ❌ REJECT RECEIPT
        if (!remarks || remarks.trim() === "") {
          return res.status(400).json({
            success: false,
            message: "Remarks are required when rejecting a receipt.",
          });
        }
        await request.execute("sp_Receipt_Delete");
      } else {
        // ✅ APPROVE RECEIPT
        request.input("Remarks", sql.NVarChar(500), remarks || null);
        request.input(
          "ReceiptApprovalDate",
          sql.DateTime,
          receiptApprovalDate || new Date(),
        );
        await request.execute("sp_ReceiptApproval_AddEdit");
      }

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "FINANCE")
        .input("subModuleName", sql.NVarChar, "Finance Receipt Approval 1")
        .execute("web_sp_Notification_Update");

      // Dashboard Update
      const postRequest = new sql.Request(pool);
      applyBranchCode(postRequest, req.headers); // 👈 Fix applied
      await postRequest.batch(`
        EXEC sp_ReceiptAppoval_GetPendings @CompanyCode = ${companyCode}
        UPDATE tbl_DashBoard
        SET Finance_Receipt_Approval_Stage1 = @@ROWCOUNT
      `);

      // ✅ Commit transaction
      await transaction.commit();

      const isApproved = reject !== 1;

      return res.status(200).json({
        success: true,
        message: isApproved
          ? "Receipt Approved Successfully!"
          : "Receipt Rejected Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Receipt Approval Transaction Failed.",
      });
    }
  } catch (err) {
    console.error("Outer Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Receipt Approval Failed.",
    });
  }
};

export const receiptApprovalTwo = async (req, res) => {
  const { id, companyCode, remarks, reject, receiptApprovalDate } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { userId, nodeCode, FYCode } = req.headers;

    // ✅ Start transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      // Common inputs
      request
        .input("ReceiptCode", sql.Int, id)
        .input("CompanyCode", sql.Int, companyCode)
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode);

      if (reject === 1) {
        request.input("Del_Remarks", sql.NVarChar(500), remarks || null);
        if (!remarks || remarks.trim() === "") {
          return res.status(400).json({
            success: false,
            message: "Remarks are required when rejecting a receipt.",
          });
        }
        await request.execute("sp_ReceiptApproval_Delete");
      } else {
        // ✅ APPROVE RECEIPT
        request.input("Remarks", sql.NVarChar(500), remarks || null);
        request.input(
          "ReceiptApprovalDate",
          sql.DateTime,
          receiptApprovalDate || new Date(),
        );
        await request.execute("sp_ReceiptApproval_Final_AddEdit");
      }

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "FINANCE")
        .input("subModuleName", sql.NVarChar, "Finance Receipt Approval 2")
        .execute("web_sp_Notification_Update");

      // Dashboard Update
      const postRequest = new sql.Request(pool);
      applyBranchCode(postRequest, req.headers); // 👈 Fix applied
      await postRequest.batch(`
        EXEC sp_ReceiptAppoval_Final_GetPendings @CompanyCode = ${companyCode}
        UPDATE tbl_DashBoard
        SET Finance_Receipt_Approval_Stage2 = @@ROWCOUNT
      `);

      // ✅ Commit transaction
      await transaction.commit();

      const isApproved = reject !== 1;

      return res.status(200).json({
        success: true,
        message: isApproved
          ? "Receipt Approved Successfully!"
          : "Receipt Rejected Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Receipt Approval Transaction Failed.",
      });
    }
  } catch (err) {
    console.error("Outer Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Receipt Approval Failed.",
    });
  }
};

export const creditNoteApproval = async (req, res) => {
  const { id, companyCode, remarks, reject, creditNoteApprovalDate } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { userId, nodeCode, FYCode } = req.headers;

    // ✅ Start transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      // Common inputs
      request
        .input("CreditNoteCode", sql.Int, id)
        .input("CompanyCode", sql.Int, companyCode)
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode);

      if (reject === 1) {
        // ✅ REJECT FLOW
        request.input(
          "CreditNoteApprovalDate",
          sql.DateTime,
          creditNoteApprovalDate || new Date(),
        );
        request.input("Remarks", sql.NVarChar(500), remarks || null);
        request.input("Reject", sql.Int, 1);

        if (!remarks || remarks.trim() === "") {
          return res.status(400).json({
            success: false,
            message: "Remarks are required when rejecting a credit note.",
          });
        }

        await request.execute("sp_CreditNoteApproval_AddEdit");

        // Optional: Call specific reject stored procedure if needed
        const rejectRequest = new sql.Request(transaction);
        applyBranchCode(rejectRequest, req.headers); // 👈 Fix applied
        rejectRequest
          .input("CreditNoteCode", sql.Int, id)
          .input("CompanyCode", sql.Int, companyCode);
        await rejectRequest.execute("sp_CreditNote_Reject");
      } else {
        // ✅ APPROVE FLOW
        request.input(
          "CreditNoteApprovalDate",
          sql.DateTime,
          creditNoteApprovalDate || new Date(),
        );
        request.input("Remarks", sql.NVarChar(500), remarks || null);
        request.input("Reject", sql.Int, 0);

        await request.execute("sp_CreditNoteApproval_AddEdit");
      }

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "FINANCE")
        .input("subModuleName", sql.NVarChar, "Finance Credit Note Approval")
        .execute("web_sp_Notification_Update");

      const postRequest = new sql.Request(pool);
      applyBranchCode(postRequest, req.headers); // 👈 Fix applied
      await postRequest.batch(`
        EXEC sp_CreditNoteAppoval_GetPendings
        UPDATE tbl_DashBoard
        SET Finance_CreditNote_Approval_Pendings = @@ROWCOUNT
      `);

      // ✅ Commit transaction
      await transaction.commit();

      return res.status(200).json({
        success: true,
        message:
          reject === 1
            ? "Credit Note Rejected Successfully!"
            : "Credit Note Approved Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Credit Note Approval Transaction Failed.",
      });
    }
  } catch (err) {
    console.error("Outer Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Credit Note Approval Failed.",
    });
  }
};

export const debitNoteApproval = async (req, res) => {
  const { id, companyCode, remarks, reject, debitNoteApprovalDate } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { userId, nodeCode, FYCode } = req.headers;

    // ✅ Start transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      // Common inputs
      request
        .input("DebitNoteCode", sql.Int, id)
        .input("CompanyCode", sql.Int, companyCode)
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode);

      if (reject === 1) {
        // ✅ REJECT FLOW
        request.input(
          "DebitNoteApprovalDate",
          sql.DateTime,
          debitNoteApprovalDate || new Date(),
        );
        request.input("Remarks", sql.NVarChar(500), remarks || null);
        request.input("Reject", sql.Int, 1);

        if (!remarks || remarks.trim() === "") {
          return res.status(400).json({
            success: false,
            message: "Remarks are required when rejecting a debit note.",
          });
        }

        await request.execute("sp_DebitNoteApproval_AddEdit");

        // Optional: Call specific reject stored procedure
        const rejectRequest = new sql.Request(transaction);
        applyBranchCode(rejectRequest, req.headers); // 👈 Fix applied
        rejectRequest
          .input("DebitNoteCode", sql.Int, id)
          .input("CompanyCode", sql.Int, companyCode);
        await rejectRequest.execute("sp_DebitNote_Reject");
      } else {
        // ✅ APPROVE FLOW
        request.input(
          "DebitNoteApprovalDate",
          sql.DateTime,
          debitNoteApprovalDate || new Date(),
        );
        request.input("Remarks", sql.NVarChar(500), remarks || null);
        request.input("Reject", sql.Int, 0);

        await request.execute("sp_DebitNoteApproval_AddEdit");
      }

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "FINANCE")
        .input("subModuleName", sql.NVarChar, "Finance Debit Note Approval")
        .execute("web_sp_Notification_Update");

      const postRequest = new sql.Request(pool);
      applyBranchCode(postRequest, req.headers); // 👈 Fix applied
      await postRequest.batch(`
        EXEC sp_DebitNoteAppoval_GetPendings
        UPDATE tbl_DashBoard
        SET Finance_DebitNote_Approval_Pendings = @@ROWCOUNT
      `);

      // ✅ Commit transaction
      await transaction.commit();

      return res.status(200).json({
        success: true,
        message:
          reject === 1
            ? "Debit Note Rejected Successfully!"
            : "Debit Note Approved Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Debit Note Approval Transaction Failed.",
      });
    }
  } catch (err) {
    console.error("Outer Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Debit Note Approval Failed.",
    });
  }
};

// Get list function

export const getReceipt1Overview = async (req, res) => {
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

    // Execute the stored procedure
    let mainResult = await request
      .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("ReceiptCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_Receipt_GetAll");

    const totalRecords = mainResult?.recordset?.length || 0;
    const addId = Object.assign({
      ...mainResult.recordset?.[0],
      id: mainResult.recordset?.[0]?.AdvanceRequisitionCode,
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

export const getAdvPaymentApprove1Overview = async (req, res) => {
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

    // Execute the stored procedure
    let mainResult = await request
      .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("AdvanceRequisitionCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_AdvanceRequisition_GetAll");

    const totalRecords = mainResult?.recordset?.length || 0;
    const addId = Object.assign({
      ...mainResult.recordset?.[0],
      id: mainResult.recordset?.[0]?.AdvanceRequisitionCode,
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

export const getAdvPaymentApprove2Overview = async (req, res) => {
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

    // Execute the stored procedure
    let mainResult = await request
      .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("AdvanceRequisitionCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_AdvanceRequisition_GetAll");

    const totalRecords = mainResult?.recordset?.length || 0;
    const addId = Object.assign({
      ...mainResult.recordset?.[0],
      id: mainResult.recordset?.[0]?.AdvanceRequisitionCode,
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

export const getPaymentApproveOverview = async (req, res) => {
  try {
    const paramData = req.query;
    const paramId = req.params;
    const FYEnd = req.headers.FYEnd;

    const toDate = new Date(FYEnd);
    if (isNaN(toDate.getTime())) {
      return res.status(400).json({ error: "Invalid FYEnd date in headers" });
    }

    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    // Fetch detailedResult first for SupplierCode extraction
    const reqDetail = pool.request();
    applyBranchCode(reqDetail, req.headers); // 👈 Fix applied
    let detailedResult = await reqDetail
      .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("PaymentCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_PaymentDetails_GetAll");

    // Fetch leaderResult
    const reqLeader = pool.request();
    applyBranchCode(reqLeader, req.headers); // 👈 Fix applied
    let leaderResult = await reqLeader
      .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("FromDate", sql.DateTime, new Date(paramData?.fromDate))
      .input("ToDate", sql.DateTime, toDate)
      .input(
        "SupplierCode",
        sql.Int,
        parseInt(detailedResult?.recordset?.[0]?.SupplierCode) || 0,
      )
      .input("Cotton", sql.Int, parseInt(paramData?.cotton) || 0)
      .input("Stores", sql.Int, parseInt(paramId?.stores) || 0)
      .input("Cotton_Freight", sql.Int, parseInt(paramId?.cottonFreight) || 0)
      .input(
        "TRANSPORT_FREIGHT",
        sql.Int,
        parseInt(paramId?.transportFreight) || 0,
      )
      .input(
        "YARN_AGENT_COMMISSION",
        sql.Int,
        parseInt(paramId?.yanAgentCommission) || 0,
      )
      .input("SERVICE_ORDER", sql.Int, parseInt(paramId?.serviceOrder) || 0)
      .input(
        "LABOUR_AGENT_COMMISSION",
        sql.Int,
        parseInt(paramId?.labourAgentCommision) || 0,
      )
      .input("YARN_PURCHASE", sql.Int, parseInt(paramId?.yarnPurchese) || 0)
      .execute("sp_Supplier_Ledger_Generate");

    // Fetch mainResult
    const reqMain = pool.request();
    applyBranchCode(reqMain, req.headers); // 👈 Fix applied
    let mainResult = await reqMain
      .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("PaymentCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_PaymentDetails_GetLedger");

    const mainOutput = mainResult?.recordset || [];

    // Sorting logic
    function getDynamicOrderFromData(data) {
      const seen = new Set();
      return data.reduce((order, item) => {
        if (!seen.has(item.RefCode)) {
          seen.add(item.RefCode);
          order.push(item.RefCode);
        }
        return order;
      }, []);
    }

    function sortByDynamicOrder(array, orderArray, key) {
      return array.sort((a, b) => {
        const aIndex = orderArray.indexOf(a[key]);
        const bIndex = orderArray.indexOf(b[key]);
        const aRank = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
        const bRank = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
        return aRank - bRank;
      });
    }

    const dynamicOrder = getDynamicOrderFromData(mainOutput);
    const updatedSortedMainOutput = sortByDynamicOrder(
      mainOutput.map((item) => ({ ...item, id: item.PaymentCode })),
      dynamicOrder,
      "RefCode",
    );

    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + pageSize,
    );

    const outputData = {
      mainOutput: updatedSortedMainOutput,
      detailedOutput: paginatedData,
    };

    res.status(200).json({
      totalRecords: detailedResult?.recordset.length || 0,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil((detailedResult?.recordset.length || 0) / pageSize),
      data: outputData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const creditNoteDetailsOverview = async (req, res) => {
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
    const request = pool.request();
    applyBranchCode(request, req.headers); // 👈 Fix applied

    let detailedResult = await request
      .input("CreditNoteCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_CreditNoteDetails_GetAll");

    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + pageSize,
    );
    const outputData = {
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

export const debitNoteDetailsOverview = async (req, res) => {
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
    const request = pool.request();
    applyBranchCode(request, req.headers); // 👈 Fix applied

    let detailedResult = await request
      .input("DebitNoteCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_DebitNoteDetails_GetAll");

    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + pageSize,
    );
    const outputData = {
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
