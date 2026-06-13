// import { log } from "console";
// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const storePurchaseAdviceApproval = async (req, res) => {
//   const bodyData = req.body;
//   console.log(1.22);
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

//     try {
//       await transaction.begin(); // ✅ Make sure this completes

//       const dashboardResult = await pool
//         .request()
//         .query(
//           "SELECT Stores_Purchase_Adivce_Approval_Pendings FROM tbl_Dashboard"
//         );

//       const pendingValue =
//         dashboardResult.recordset?.[0]
//           ?.Stores_Purchase_Adivce_Approval_Pendings || 0;
//       const request1 = new sql.Request(transaction);
//       if (
//         req.headers.subdbname === "KPF" ||
//         req.headers.subdbname === "LOCALHOST"
//       ) {
//         request1.input(
//           "PurchaseAdviceCode",
//           sql.Int,
//           bodyData?.purchaseAdviceCode
//         );
//       }
//       const getApprovaltNo = await request1

//         .input("CompanyCode", sql.Int, parseInt(bodyData?.companyCode))
//         .input("FYCode", sql.Int, parseInt(FYCode))
//         .execute("sp_PurchaseAdviceApprove_PurchaseAdviceApproveNo");

//       const request2 = new sql.Request(transaction);

//       const purchaseAdviceApprove = await request2
//         .input(
//           "PurchaseAdviceApproveDate",
//           sql.DateTime,
//           new Date(bodyData?.approvalDate)
//         )
//         .input(
//           "PurchaseAdviceApproveNo",
//           sql.Int,
//           getApprovaltNo.recordset[0]["PurchaseAdviceApproveNo"]
//         )
//         .input("PurchaseAdviceCode", sql.Int, bodyData?.purchaseAdviceCode)
//         .input("PurchaseModeCode", sql.Int, bodyData?.purchaseModeCode)
//         .input("SupplierCode", sql.Int, bodyData?.supplierCode)
//         .input("PurchaseTypeCode", sql.Int, bodyData?.purchaseTypeCode)
//         .input("TotalQty", sql.Int, bodyData?.totalQty)
//         .input("TotalAmount", sql.Int, bodyData?.totalAmount)
//         .input("TotalDiscountper", sql.Int, bodyData?.totalDiscountper)
//         .input("TotalDiscountAmount", sql.Int, bodyData?.totalDiscountAmount)
//         .input("TotalGrossAmount", sql.Int, bodyData?.totalGrossAmount)
//         .input("TotalTaxPer", sql.Int, bodyData?.totalTaxPer)
//         .input("TotalTaxAmount", sql.Int, bodyData?.totalTaxAmount)
//         .input("TotalCSTPer", sql.Int, bodyData?.totalCSTPer)
//         .input("TotalCSTAmount", sql.Int, bodyData?.totalCSTAmount)
//         .input("TotalPFPer", sql.Int, bodyData?.totalPFPer)
//         .input("TotalPFAmount", sql.Int, bodyData?.totalPFAmount)
//         .input("TotalCGSTAmount", sql.Int, bodyData?.totalCGSTAmount)
//         .input("TotalCGSTPer", sql.Int, bodyData?.totalCGSTPer)
//         .input("TotalSGSTAmount", sql.Int, bodyData?.totalSGSTAmount)
//         .input("TotalSGSTPer", sql.Int, bodyData?.totalSGSTPer)
//         .input("TotalIGSTAmount", sql.Int, bodyData?.totalIGSTAmount)
//         .input("TotalIGSTPer", sql.Int, bodyData?.totalIGSTPer)
//         .input("TotalOtherExpenses", sql.Int, bodyData?.totalOtherExpenses)
//         .input("TotalTCSAmount", sql.Int, bodyData?.totalTCSAmount)
//         .input("TotalRoundedOff", sql.Int, bodyData?.totalRoundedOff)
//         .input("TotalNetAmount", sql.Int, bodyData?.totalNetAmount)
//         .input("Remarks", sql.NVarChar(500), bodyData?.remarks || "")
//         .input("Reject", sql.Int, bodyData?.reject)
//         .input("RefNo", sql.NVarChar(500), bodyData?.refNo)
//         .input("FYCode", sql.Int, FYCode)
//         .input("CompanyCode", sql.Int, bodyData?.companyCode)
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode)
//         .execute("sp_PurchaseAdviceApprove_AddEdit");

//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("CompanyCode", sql.Int, parseInt(bodyData?.companyCode))
//         .input(
//           "PurchaseAdviceApproveCode",
//           sql.Int,
//           parseInt(purchaseAdviceApprove.recordset[0][""])
//         )
//         .execute("sp_PurchaseAdviceApproveDetails_Delete");

//       // Notification Update
//       const request4 = new sql.Request(transaction);
//       await request4
//         .input("ApprovalID", sql.Int, bodyData?.purchaseAdviceCode)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "STORES")
//         .input("subModuleName", sql.NVarChar, "Store Purchase Advice Approval")
//         .execute("web_sp_Notification_Update");

//       await transaction.commit();

//       // const pendingResult = await pool
//       //   .request()
//       //   .execute("sp_PurchaseAdvice_Pending");

//       // Then run the update in a separate request
//       await pool.request().query(`
//         UPDATE tbl_DashBoard
//         SET Stores_Purchase_Adivce_Approval_Pendings = ${
//           pendingValue > 0 ? pendingValue - 1 : 0
//         };
//       `);

//       return res.status(201).json({
//         data: purchaseAdviceApprove,
//         success: true,
//         message: bodyData?.reject
//           ? "Rejected Successfully!"
//           : "Approved Successfully!",
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

// export const purchaseAdviceApproveDetails = async (req, res) => {
//   const bodyData = req.body;
//   console.log(1.11);

//   let transaction;
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     const FYCode = req.headers.FYCode;
//     const nodeCode = req.headers.nodeCode;
//     const userId = req.headers.userId;

//     // Create the Transaction
//     transaction = new sql.Transaction(pool);

//     // Always await the begin method and catch errors separately
//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);
//       await request
//         .input("SNo", sql.Int, bodyData?.sNo)
//         .input(
//           "PurchaseAdviceApproveCode",
//           sql.Int,
//           bodyData?.purchaseAdviceApprove
//         )
//         .input("CostHeadCode", sql.Int, bodyData?.costHeadCode)
//         .input("DepartmentCode", sql.Int, bodyData?.departmentCode)

//         .input("EmployeeCode", sql.Int, bodyData?.employeeCode)
//         .input("ItemCode", sql.Int, bodyData?.itemCode)
//         .input("Qty", sql.Int, bodyData?.qty)
//         .input("Rate", sql.Int, bodyData?.rate)
//         .input("Amount", sql.Int, bodyData?.amount)
//         .input("DiscountPer", sql.Int, bodyData?.discountPer)
//         .input("DiscountPerRate", sql.Int, bodyData?.discountPerRate)
//         .input("DiscountAmount", sql.Int, bodyData?.discountAmount)
//         .input("GrossAmount", sql.Int, bodyData?.grossAmount)
//         .input("TaxPer", sql.Int, bodyData?.taxPer)
//         .input("TaxAmount", sql.Int, bodyData?.taxAmount)
//         .input("CSTPer", sql.Int, bodyData?.cstPer)
//         .input("CSTAmount", sql.Int, bodyData?.cstAmount)
//         .input("CGSTPer", sql.Int, bodyData?.cgstPer)
//         .input("CGSTAmount", sql.Int, bodyData?.cgstAmount)
//         .input("SGSTPer", sql.Int, bodyData?.sgstPer)
//         .input("SGSTAmount", sql.Int, bodyData?.sgstAmount)
//         .input("IGSTPer", sql.Int, bodyData?.igstPer)
//         .input("IGSTAmount", sql.Int, bodyData?.igstAmount)
//         .input("PFPer", sql.Int, bodyData?.pfPer)
//         .input("PFAmount", sql.Int, bodyData?.pfAmount)
//         .input("TCSAmount", sql.Int, bodyData?.tcsAmount)
//         .input("OtherExpenses", sql.Int, bodyData?.otherExpenses)
//         .input("RoundedOff", sql.Int, bodyData?.roundedOff)
//         .input("NetAmount", sql.Int, bodyData?.netAmount)
//         .input("CompanyCode", sql.Int, bodyData?.companyCode)
//         .input("Reason", sql.NVarChar(500), bodyData?.reason || null);

//       if (
//         req.headers.subdbname === "KAS" ||
//         req.headers.subdbname === "LOCALHOST"
//       ) {
//         request.input("IssueTypeCode", sql.Int, bodyData?.issueTypeCode);
//         request.input("MachineCode", sql.Int, bodyData?.machineCode);
//       }
//       await request.execute("sp_PurchaseAdviceApproveDetails_Insert");

//       await transaction.commit();

//       return res.status(201).json({
//         success: true,
//         message: "Approved Successfully!",
//       });
//     } catch (err) {
//       if (transaction && !transaction._aborted) {
//         await transaction.rollback();
//       }
//       if (err.message.includes("UK_")) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Already Approved !" });
//       }
//       return res.status(500).json({ success: false, error: err.message });
//     }
//   } catch (err) {
//     if (transaction && transaction._aborted === false) {
//       await transaction.rollback();
//     }
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const storePurchaseOrderApproval = async (req, res) => {
//   const bodyData = req.body;
//   let transaction;

//   try {
//     if (!req.headers.subdbname)
//       return res.status(400).json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     const userId = req.headers.userId;
//     const nodeCode = req.headers.nodeCode;

//     if (bodyData.reject === 1 && !bodyData.rejectReason) {
//       return res.status(400).json({
//         success: false,
//         message: "Reject reason is required when rejecting.",
//       });
//     }

//     transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     /* ================= SETTINGS ================= */
//     const settingReq = new sql.Request(transaction);
//     const settingsResult = await settingReq.query(
//       `SELECT * FROM tbl_Setting WHERE SettingCode = 1`
//     );

//     const settings = settingsResult.recordset?.[0] || {};
//     const hasApproval2 = settings.PO_Approval_2 == 1;
//     const hasApproval3 = settings.PO_Approval_3 == 1;

//     /* ================= REJECT FLOW ================= */
//     if (bodyData.reject === 1) {
//       await new sql.Request(transaction)
//         .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
//         .input("UserCode", sql.Int, userId)
//         .input("NodeCode", sql.Int, nodeCode)
//         .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason)
//         .execute("sp_PurchaseOrder_Approval_1_Reject");
//     }
//     /* ================= APPROVAL FLOW ================= */
//     else {
//       await new sql.Request(transaction)
//         .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
//         .input("UserCode", sql.Int, userId)
//         .input("NodeCode", sql.Int, nodeCode)
//         .input("RejectReason", sql.NVarChar(500), "")
//         .execute("sp_PurchaseOrder_Approval_1_Update");

//       if (hasApproval2) {
//         await new sql.Request(transaction)
//           .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
//           .input("UserCode", sql.Int, userId)
//           .input("NodeCode", sql.Int, nodeCode)
//           .execute("sp_PurchaseOrder_Approval_2_Update");
//       }

//       if (hasApproval3) {
//         await new sql.Request(transaction)
//           .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
//           .input("UserCode", sql.Int, userId)
//           .input("NodeCode", sql.Int, nodeCode)
//           .execute("sp_PurchaseOrder_Approval_3_Update");
//       }
//     }

//     /* ================= DASHBOARD ================= */
//     await new sql.Request(transaction).batch(`
//       EXEC sp_PurchaseOrder_Approval_1_Pendings
//       UPDATE tbl_DashBoard
//       SET Stores_PurchaseOrder_Approval_Pendings_Store = @@ROWCOUNT

//       EXEC sp_PurchaseOrder_Approval_2_Pendings
//       UPDATE tbl_DashBoard
//       SET Stores_PurchaseOrder_Approval_Pendings_GM = @@ROWCOUNT
//     `);

//     /* ================= NOTIFICATION ================= */
//     await new sql.Request(transaction)
//       .input("ApprovalID", sql.Int, bodyData.purchaseOrderCode)
//       .input("IsNotify", sql.Bit, 1)
//       .input("IsRead", sql.Bit, 1)
//       .input("IsApproved", sql.Bit, 1)
//       .input("ModuleName", sql.NVarChar, "STORES")
//       .input("subModuleName", sql.NVarChar, "Store Purchase Order Approval")
//       .execute("web_sp_Notification_Update");

//     await transaction.commit();

//     return res.status(200).json({
//       success: true,
//       message: bodyData.reject === 1
//         ? "Purchase Order Rejected Successfully!"
//         : "Purchase Order Approved Successfully!",
//     });

//   } catch (err) {
//     if (transaction?._aborted === false) {
//       await transaction.rollback();
//     }

//     console.error("Transaction Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: err.message || "Approval process failed",
//     });
//   }
// };

// export const storePurchaseOrderApprovalGM = async (req, res) => {
//   const bodyData = req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     const FYCode = req.headers.FYCode;
//     const nodeCode = req.headers.nodeCode;
//     const userId = req.headers.userId;

//     // 🔹 Validate reject reason
//     if (bodyData.reject === 1 && !bodyData.rejectReason) {
//       return res.status(400).json({
//         success: false,
//         message: "Reject reason is required when rejecting.",
//       });
//     }

//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       // 🔹 Step 1: Check TotalNetAmount for PO
//       const checkRequest = new sql.Request(transaction);
//       const result = await checkRequest
//         .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
//         .query(
//           `SELECT TotalNetAmount
//            FROM tbl_PurchaseOrder
//            WHERE PurchaseOrderCode = @PurchaseOrderCode`
//         );

//       const totalNetAmount = result.recordset?.[0]?.TotalNetAmount || 0;

//       // 🔹 Step 2: Handle Reject
//       if (bodyData.reject === 1) {
//         const rejectReq = new sql.Request(transaction);
//         await rejectReq
//           .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
//           .input("UserCode", sql.Int, userId)
//           .input("NodeCode", sql.Int, nodeCode)
//           .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason)
//           .execute("sp_PurchaseOrder_Approval_2_Reject");

//         // Notification Update
//         const request3 = new sql.Request(transaction);
//         await request3
//           .input("ApprovalID", sql.Int, bodyData.purchaseOrderCode)
//           .input("IsNotify", sql.Bit, 1)
//           .input("IsRead", sql.Bit, 1)
//           .input("IsApproved", sql.Bit, 1)
//           .input("ModuleName", sql.NVarChar, "STORES")
//           .input(
//             "subModuleName",
//             sql.NVarChar,
//             "Store Purchase Order Approval - GM"
//           )
//           .execute("web_sp_Notification_Update");

//         const postRequest = new sql.Request(transaction);
//         await postRequest.batch(`
//         EXEC sp_PurchaseOrder_Approval_2_Pendings
//         UPDATE tbl_DashBoard
//         SET Stores_PurchaseOrder_Approval_Pendings_GM = @@ROWCOUNT
//       `);

//         await transaction.commit();
//         return res.status(200).json({
//           success: true,
//           message: "PO Rejected Successfully (Stage 2)!",
//         });
//       }

//       // 🔹 Step 3: Approve (Level 2)
//       const approval2Req = new sql.Request(transaction);
//       await approval2Req
//         .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
//         .input("UserCode", sql.Int, userId)
//         .input("NodeCode", sql.Int, nodeCode)
//         .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason || "")
//         .execute("sp_PurchaseOrder_Approval_2_Update");

//       // 🔹 Step 4: If amount <= 50000, also call Approval 3
//       if (totalNetAmount <= 50000 && req.headers.subdbname == "KAS") {
//         const approval3Req = new sql.Request(transaction);
//         await approval3Req
//           .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
//           .input("UserCode", sql.Int, userId)
//           .input("NodeCode", sql.Int, nodeCode)
//           .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason || "")
//           .execute("sp_PurchaseOrder_Approval_3_Update");
//       }

//       // 🔹 Step 5: Refresh dashboard counts
//       const postRequest = new sql.Request(transaction);
//       await postRequest.batch(`
//         EXEC sp_PurchaseOrder_Approval_2_Pendings
//         UPDATE tbl_DashBoard
//         SET Stores_PurchaseOrder_Approval_Pendings_GM = @@ROWCOUNT
//       `);

//       const postRequest1 = new sql.Request(transaction);
//       await postRequest1.batch(`
//         EXEC sp_PurchaseOrder_Approval_3_Pendings
//         UPDATE tbl_DashBoard
//         SET Stores_PurchaseOrder_Approval_Pendings_MD = @@ROWCOUNT
//       `);

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, bodyData.purchaseOrderCode)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "STORES")
//         .input(
//           "subModuleName",
//           sql.NVarChar,
//           "Store Purchase Order Approval - GM"
//         )
//         .execute("web_sp_Notification_Update");

//       await transaction.commit();

//       return res.status(200).json({
//         success: true,
//         message: "PO Approved Successfully (Stage 2)!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Approval process failed.",
//       });
//     }
//   } catch (err) {
//     console.error("Outer Error:", err);
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const storePurchaseOrderApprovalMD = async (req, res) => {
//   const bodyData = req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     const FYCode = req.headers.FYCode;
//     const nodeCode = req.headers.nodeCode;
//     const userId = req.headers.userId;

//     // 🔹 Validate reject reason
//     if (bodyData.reject === 1 && !bodyData.rejectReason) {
//       return res.status(400).json({
//         success: false,
//         message: "Reject reason is required when rejecting.",
//       });
//     }

//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       // 🔹 Step 2: Handle Reject
//       if (bodyData.reject === 1) {
//         const rejectReq = new sql.Request(transaction);
//         await rejectReq
//           .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
//           .input("UserCode", sql.Int, userId)
//           .input("NodeCode", sql.Int, nodeCode)
//           .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason)
//           .execute("sp_PurchaseOrder_Approval_3_Reject");

//         // Notification Update
//         const request3 = new sql.Request(transaction);
//         await request3
//           .input("ApprovalID", sql.Int, bodyData.purchaseOrderCode)
//           .input("IsNotify", sql.Bit, 1)
//           .input("IsRead", sql.Bit, 1)
//           .input("IsApproved", sql.Bit, 1)
//           .input("ModuleName", sql.NVarChar, "STORES")
//           .input(
//             "subModuleName",
//             sql.NVarChar,
//             "Store Purchase Order Approval - MD"
//           )
//           .execute("web_sp_Notification_Update");

//         const postRequest = new sql.Request(transaction);
//         await postRequest.batch(`
//         EXEC sp_PurchaseOrder_Approval_3_Pendings
//         UPDATE tbl_DashBoard
//         SET Stores_PurchaseOrder_Approval_Pendings_MD = @@ROWCOUNT
//       `);

//         await transaction.commit();
//         return res.status(200).json({
//           success: true,
//           message: "Purchase Order Rejected Successfully (Level 3)!",
//         });
//       }

//       // 🔹 Step 3: Approve (Level 2)
//       const approval2Req = new sql.Request(transaction);
//       await approval2Req
//         .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
//         .input("UserCode", sql.Int, userId)
//         .input("NodeCode", sql.Int, nodeCode)
//         .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason || "")
//         .execute("sp_PurchaseOrder_Approval_3_Update");

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, bodyData.purchaseOrderCode)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "STORES")
//         .input(
//           "subModuleName",
//           sql.NVarChar,
//           "Store Purchase Order Approval - MD"
//         )
//         .execute("web_sp_Notification_Update");

//       // 🔹 Step 5: Refresh dashboard counts
//       const postRequest = new sql.Request(transaction);
//       await postRequest.batch(`
//         EXEC sp_PurchaseOrder_Approval_3_Pendings
//         UPDATE tbl_DashBoard
//         SET Stores_PurchaseOrder_Approval_Pendings_MD = @@ROWCOUNT
//       `);

//       await transaction.commit();

//       return res.status(200).json({
//         success: true,
//         message: "PO Approved Successfully (Stage 3)!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Approval process failed.",
//       });
//     }
//   } catch (err) {
//     console.error("Outer Error:", err);
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const storeBillPassingApproval = async (req, res) => {
//   const bodyData = req.body;

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

//     try {
//       await transaction.begin();

//       const request1 = new sql.Request(transaction);

//       // ✅ Validate Reject case - remarks required
//       if (bodyData.reject === 1 && !bodyData.remarks) {
//         return res.status(400).json({
//           success: false,
//           message: "Remarks are required for rejection!",
//         });
//       }

//       // ✅ Call sp_StoresGRNApproval_Insert
//       const approvalInsert = await request1
//         .input("ApprovalDate", sql.DateTime, new Date(bodyData?.approvalDate))
//         .input("PurchaseOrderReceivedCode", sql.Int, bodyData?.id)
//         .input("Reject", sql.Int, bodyData?.reject || 0)
//         .input("Remarks", sql.NVarChar(500), bodyData?.remarks || "")
//         .input("FYCode", sql.Int, FYCode)
//         .input("CompanyCode", sql.Int, bodyData?.companyCode)
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode)
//         .execute("sp_StoresGRNApproval_Insert");

//       // ✅ If reject, also run rejection-related procs
//       if (bodyData.reject === 1) {
//         // 1️⃣ sp_StoresGRN_Reject
//         const request2 = new sql.Request(transaction);
//         await request2
//           .input("PurchaseOrderReceivedCode", sql.Int, bodyData?.id)
//           .input("CompanyCode", sql.Int, bodyData?.companyCode)
//           .execute("sp_StoresGRN_Reject");

//         // 2️⃣ Get Inward Details
//         const inwardRequest = new sql.Request(transaction);
//         const inwardResult = await inwardRequest.query(
//           `SELECT * FROM vw_PurchaseOrderReceivedDetails WHERE PurchaseOrderReceivedCode = ${bodyData?.id}`
//         );

//         const inwardDetails = inwardResult.recordset;
//         if (inwardDetails.length > 0) {
//           let taxTypeCode;
//           if (req.headers.subdbname == "KAS") {
//             taxTypeCode = 7;
//           } else if (
//             req.headers.subdbname == "KPF" ||
//             req.headers.subdbname == "SASM"
//           ) {
//             taxTypeCode = 6;
//           } else {
//             taxTypeCode = 6;
//           }
//           // 3️⃣ Get DebitNoteNo
//           const debitNoteReq = new sql.Request(transaction);
//           const debitNoteResult = await debitNoteReq
//             .input("CompanyCode", sql.Int, bodyData?.companyCode)
//             .input("FYCode", sql.Int, FYCode)
//             .execute("sp_DebitNote_DebitNoteNo");

//           const debitNoteNo =
//             debitNoteResult.recordset?.[0]?.DebitNoteNo || null;

//           // 4️⃣ sp_DebitNote_AddEdit
//           const debitAddReq = new sql.Request(transaction);
//           const debitAdd = await debitAddReq
//             .input("User", sql.Int, userId)
//             .input("Node", sql.Int, nodeCode)
//             .input("DebitNoteNo", sql.Int, debitNoteNo)
//             .input("DebitNoteDate", sql.DateTime, bodyData?.approvalDate)
//             .input("RefType", sql.NVarChar(50), "STORES")
//             .input("SupplierCode", sql.Int, inwardDetails?.[0]?.SupplierCode)
//             .input("DebitTypeCode", sql.Int, 3)
//             .input(
//               "RefCode",
//               sql.Int,
//               inwardDetails?.[0]?.PurchaseOrderReceivedCode
//             )
//             .input(
//               "SupplierRefNo",
//               sql.Int,
//               inwardDetails?.[0]?.PurchaseOrderReceivedNo
//             )
//             .input("TaxTypeCode", sql.Int, taxTypeCode)
//             .input(
//               "TotalBasicAmount",
//               sql.Decimal(18, 2),
//               inwardDetails?.[0]?.TotalGrossAmount
//             )
//             .input(
//               "TotalCGSTAmount",
//               sql.Decimal(18, 2),
//               inwardDetails?.[0]?.TotalCGSTAmount
//             )
//             .input(
//               "TotalSGSTAmount",
//               sql.Decimal(18, 2),
//               inwardDetails?.[0]?.TotalSGSTAmount
//             )
//             .input(
//               "TotalIGSTAmount",
//               sql.Decimal(18, 2),
//               inwardDetails?.[0]?.TotalIGSTAmount
//             )
//             .input(
//               "TotalDebitAmount",
//               sql.Decimal(18, 2),
//               inwardDetails?.[0]?.TotalNetAmount
//             )
//             .input(
//               "TotalAdjustmentAmount",
//               sql.Decimal(18, 2),
//               bodyData?.totalAdjustmentAmount
//             )
//             .input(
//               "TotalNetAmount",
//               sql.Decimal(18, 2),
//               inwardDetails?.[0]?.TotalNetAmount
//             )
//             .input("Remarks", sql.NVarChar(500), bodyData?.remarks || "")
//             .input("Reject", sql.Int, 0)
//             .input("FYCode", sql.Int, FYCode)
//             .input("CompanyCode", sql.Int, bodyData?.companyCode)
//             .execute("sp_DebitNote_AddEdit");

//           const debitNoteCode = debitAdd.recordset?.[0]?.DebitNoteCode || null;

//           // 5️⃣ Delete DebitNoteDetails
//           const delReq = new sql.Request(transaction);
//           await delReq
//             .input("DebitNoteCode", sql.Int, debitNoteCode)
//             .input("CompanyCode", sql.Int, bodyData?.companyCode)
//             .execute("sp_DebitNoteDetails_Delete");

//           // 6️⃣ Insert DebitNoteDetails
//           // for (const item of inwardDetails) {
//           const insReq = new sql.Request(transaction);
//           await insReq
//             .input("DebitNoteCode", sql.Int, debitNoteCode)
//             .input("RefType", sql.NVarChar(50), "STORES")
//             .input(
//               "RefCode",
//               sql.Int,
//               inwardDetails?.[0]?.PurchaseOrderReceivedCode
//             )
//             .input(
//               "BillNo",
//               sql.Int,
//               inwardDetails?.[0]?.PurchaseOrderReceivedNo
//             )
//             .input(
//               "BillDate",
//               sql.DateTime,
//               inwardDetails?.[0]?.PurchaseOrderReceivedDate
//             )
//             .input(
//               "BasicAmount",
//               sql.Decimal(18, 2),
//               inwardDetails?.[0]?.GrossAmount
//             )
//             .input("CGSTPer", sql.Decimal(5, 2), inwardDetails?.[0]?.CGSTPer)
//             .input("SGSTPer", sql.Decimal(5, 2), inwardDetails?.[0]?.SGSTPer)
//             .input("IGSTPer", sql.Decimal(5, 2), inwardDetails?.[0]?.IGSTPer)
//             .input(
//               "CGSTAmount",
//               sql.Decimal(18, 2),
//               inwardDetails?.[0]?.TotalCGSTAmount
//             )
//             .input(
//               "SGSTAmount",
//               sql.Decimal(18, 2),
//               inwardDetails?.[0]?.TotalSGSTAmount
//             )
//             .input(
//               "IGSTAmount",
//               sql.Decimal(18, 2),
//               inwardDetails?.[0]?.TotalIGSTAmount
//             )
//             .input(
//               "Amount",
//               sql.Decimal(18, 2),
//               inwardDetails?.[0]?.TotalNetAmount
//             )
//             .input("CompanyCode", sql.Int, bodyData?.companyCode)
//             .execute("sp_DebitNoteDetails_Insert");
//           // }
//         }

//         // Notification Update
//         const request3 = new sql.Request(transaction);
//         await request3
//           .input("ApprovalID", sql.Int, bodyData?.id)
//           .input("IsNotify", sql.Bit, 1)
//           .input("IsRead", sql.Bit, 1)
//           .input("IsApproved", sql.Bit, 1)
//           .input("ModuleName", sql.NVarChar, "STORES")
//           .input("subModuleName", sql.NVarChar, "Store Bill Passing Approval")
//           .execute("web_sp_Notification_Update");

//         const postRequest = new sql.Request(transaction);
//         await postRequest.batch(`
//         EXEC sp_GRNApproval_GetPendings @CompanyCode = ${bodyData?.companyCode}
//         UPDATE tbl_DashBoard
//         SET Stores_BillPassing_Pendings = @@ROWCOUNT
//       `);
//       }

//       const postRequest = new sql.Request(transaction);
//       await postRequest.batch(`
//          EXEC sp_GRNApproval_GetPendings @CompanyCode = ${bodyData?.companyCode}
//         UPDATE tbl_DashBoard
//         SET Stores_BillPassing_Pendings = @@ROWCOUNT
//       `);

//       await transaction.commit();

//       return res.status(200).json({
//         success: true,
//         message:
//           bodyData.reject === 1
//             ? "Rejected Successfully!"
//             : "Approved Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("❌ Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: "Transaction Failed",
//         error: err.message,
//       });
//     }
//   } catch (err) {
//     console.error("❌ Outer Error:", err);
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const storeGoodsInApproval = async (req, res) => {
//   const bodyData = req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     const userId = req.headers.userId;
//     const nodeCode = req.headers.nodeCode;

//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       // 🔹 Reject Flow
//       if (bodyData.reject === 1) {
//         const rejectReq = new sql.Request(transaction);
//         await rejectReq
//           .input("CompanyCode", sql.Int, bodyData.companyCode)
//           .input("GoodsInPassCode", sql.Int, bodyData.id)
//           .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason || "")
//           .query(`
//             UPDATE tbl_GateEntryGoodsIn
//             SET Cancel = 1,
//                 StoreInDate = GETDATE(),
//                 Store_InTime = CONVERT(VARCHAR(8), GETDATE(), 108)
//             WHERE CompanyCode = @CompanyCode
//               AND GoodsInPassCode = @GoodsInPassCode
//           `);

//         // 🔸 Update Dashboard pending count
//         await rejectReq.query(`
//           UPDATE A
//           SET A.Stores_GoodsIn_Pendings = B.Nos
//           FROM tbl_DashBoard A,
//           (
//             SELECT ISNULL(COUNT(GoodsPassNumber), 0) AS Nos
//             FROM tbl_GateEntryGoodsIn
//             WHERE StoreInDate IS NULL
//           ) B
//           WHERE A.DashBoardCode = 1
//         `);

//         // Notification Update
//         const request3 = new sql.Request(transaction);
//         await request3
//           .input("ApprovalID", sql.Int, bodyData?.id)
//           .input("IsNotify", sql.Bit, 1)
//           .input("IsRead", sql.Bit, 1)
//           .input("IsApproved", sql.Bit, 1)
//           .input("ModuleName", sql.NVarChar, "STORES")
//           .input("subModuleName", sql.NVarChar, "Store Goods In Approval")
//           .execute("web_sp_Notification_Update");

//         await transaction.commit();
//         return res.status(200).json({
//           success: true,
//           message: "Store Goods In Rejected Successfully!",
//         });
//       }

//       // 🔹 Approve Flow
//       const approveReq = new sql.Request(transaction);
//       await approveReq
//         .input("CompanyCode", sql.Int, bodyData.companyCode)
//         .input("GoodsInPassCode", sql.Int, bodyData.id).query(`
//           UPDATE tbl_GateEntryGoodsIn
//           SET StoreInDate = GETDATE(),
//               Store_InTime = CONVERT(VARCHAR(8), GETDATE(), 108)
//           WHERE CompanyCode = @CompanyCode
//             AND GoodsInPassCode = @GoodsInPassCode
//         `);

//       // 🔸 Update Dashboard pending count
//       await approveReq.query(`
//         UPDATE A
//         SET A.Stores_GoodsIn_Pendings = B.Nos
//         FROM tbl_DashBoard A,
//         (
//           SELECT ISNULL(COUNT(GoodsPassNumber), 0) AS Nos
//           FROM tbl_GateEntryGoodsIn
//           WHERE StoreInDate IS NULL
//         ) B
//         WHERE A.DashBoardCode = 1
//       `);

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, bodyData?.id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "STORES")
//         .input("subModuleName", sql.NVarChar, "Store Goods In Approval")
//         .execute("web_sp_Notification_Update");

//       await transaction.commit();
//       return res.status(200).json({
//         success: true,
//         message: "Store Goods In Approved Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Approval process failed.",
//       });
//     }
//   } catch (err) {
//     console.error("Outer Error:", err);
//     return res.status(500).json({
//       success: false,
//       error: err.message,
//     });
//   }
// };

// export const storeGoodsOutApprovalOne = async (req, res) => {
//   const bodyData = req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     const userId = req.headers.userId;
//     const nodeCode = req.headers.nodeCode;

//     // ✅ Validate reject reason if rejected
//     if (bodyData.reject === 1 && !bodyData.rejectReason) {
//       return res.status(400).json({
//         success: false,
//         message: "Reject reason is required when rejecting.",
//       });
//     }

//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       // 🔹 Reject Flow
//       if (bodyData.reject === 1) {
//         const rejectReq = new sql.Request(transaction);
//         await rejectReq
//           .input("CompanyCode", sql.Int, bodyData.companyCode)
//           .input("GoodsOutPassCode", sql.Int, bodyData.id)
//           .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason || "")
//           .query(`
//             UPDATE tbl_GateEntryGoodsOut
//             SET Cancel = 1,
//                 CancelReason = @RejectReason
//             WHERE CompanyCode = @CompanyCode
//               AND GoodsOutPassCode = @GoodsOutPassCode
//           `);

//         // 🔸 Update dashboard pending count using stored procedure
//         await rejectReq.query(`
//           EXEC sp_GateEntry_GoodsOut_Approval_Stage1_Pending @CompanyCode = ${bodyData.companyCode};
//           UPDATE tbl_DashBoard
//           SET Store_GatePassApprovalPending_Stage1 = @@ROWCOUNT;
//         `);

//         // Notification Update
//         const request3 = new sql.Request(transaction);
//         await request3
//           .input("ApprovalID", sql.Int, bodyData?.id)
//           .input("IsNotify", sql.Bit, 1)
//           .input("IsRead", sql.Bit, 1)
//           .input("IsApproved", sql.Bit, 1)
//           .input("ModuleName", sql.NVarChar, "STORES")
//           .input("subModuleName", sql.NVarChar, "Store Goods Out Approval 1")
//           .execute("web_sp_Notification_Update");

//         await transaction.commit();
//         return res.status(200).json({
//           success: true,
//           message: "Store Goods Out Rejected Successfully!",
//         });
//       }

//       // 🔹 Approve Flow
//       const settingReq = new sql.Request(transaction);
//       const settingResult = await settingReq.query(`
//         SELECT GoodsOut_Approval FROM tbl_Setting WHERE GoodsOut_Approval = 0
//       `);

//       const hasSetting = settingResult.recordset.length > 0;

//       const approveReq = new sql.Request(transaction);
//       approveReq
//         .input("CompanyCode", sql.Int, bodyData.companyCode)
//         .input("GoodsOutPassCode", sql.Int, bodyData.id);

//       if (hasSetting) {
//         // Both stages approved
//         await approveReq.query(`
//           UPDATE tbl_GateEntryGoodsOut
//           SET Approval_Stage1 = 1,
//               Approval_Stage2 = 1,
//               GateOutDate = GETDATE(),
//               OutTime = CONVERT(VARCHAR(8), GETDATE(), 108)
//           WHERE CompanyCode = @CompanyCode
//             AND GoodsOutPassCode = @GoodsOutPassCode
//         `);
//       } else {
//         // Only Stage1 approved
//         await approveReq.query(`
//           UPDATE tbl_GateEntryGoodsOut
//           SET Approval_Stage1 = 1
//           WHERE CompanyCode = @CompanyCode
//             AND GoodsOutPassCode = @GoodsOutPassCode
//         `);
//       }

//       // 🔸 After approval, execute SP + update dashboard
//       await approveReq.query(`
//         EXEC sp_GateEntry_GoodsOut_Approval_Stage1_Pending @CompanyCode = ${bodyData.companyCode};
//         UPDATE tbl_DashBoard
//         SET Store_GatePassApprovalPending_Stage1 = @@ROWCOUNT;
//       `);

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, bodyData?.id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "STORES")
//         .input("subModuleName", sql.NVarChar, "Store Goods Out Approval 1")
//         .execute("web_sp_Notification_Update");

//       await transaction.commit();
//       return res.status(200).json({
//         success: true,
//         message: hasSetting
//           ? "Store Goods Out Approved (Both Stages) Successfully!"
//           : "Store Goods Out Stage 1 Approved Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Approval process failed.",
//       });
//     }
//   } catch (err) {
//     console.error("Outer Error:", err);
//     return res.status(500).json({
//       success: false,
//       error: err.message,
//     });
//   }
// };

// export const storeGoodsOutApprovalTwo = async (req, res) => {
//   const payload = req.body; // payload: cpoCode, reason, reject, companyCode, message

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     const userId = req.headers.userId;
//     const nodeCode = req.headers.nodeCode;

//     // ✅ Validate reject reason if rejected
//     if (payload.reject === 1 && !payload.rejectReason) {
//       return res.status(400).json({
//         success: false,
//         message: "Reject reason is required when rejecting.",
//       });
//     }

//     const transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     try {
//       // 🔹 Reject Flow
//       const rejectReq = new sql.Request(transaction);
//       if (payload.reject === 1) {
//         await rejectReq
//           .input("CompanyCode", sql.Int, payload.companyCode)
//           .input("GoodsOutPassCode", sql.Int, payload.id)
//           .input("RejectReason", sql.NVarChar(500), payload.rejectReason || "")
//           .query(`
//             UPDATE tbl_GateEntryGoodsOut
//             SET Cancel = 1,
//                 CancelReason = @RejectReason
//             WHERE CompanyCode = @CompanyCode
//               AND GoodsOutPassCode = @GoodsOutPassCode
//           `);

//         await rejectReq.query(`
//           EXEC sp_GateEntry_GoodsOut_Approval_Stage2_Pending @CompanyCode = ${payload.companyCode};
//           UPDATE tbl_DashBoard
//           SET Store_GatePassApprovalPending_Stage2 = @@ROWCOUNT;
//         `);

//         // Notification Update
//         const request3 = new sql.Request(transaction);
//         await request3
//           .input("ApprovalID", sql.Int, payload?.id)
//           .input("IsNotify", sql.Bit, 1)
//           .input("IsRead", sql.Bit, 1)
//           .input("IsApproved", sql.Bit, 1)
//           .input("ModuleName", sql.NVarChar, "STORES")
//           .input("subModuleName", sql.NVarChar, "Store Goods Out Approval 2")
//           .execute("web_sp_Notification_Update");

//         await transaction.commit();
//         return res.status(200).json({
//           success: true,
//           message:
//             payload.message || "Store Goods Out Stage 2 Rejected Successfully!",
//         });
//       }

//       // 🔹 Approve Flow (Stage 2)
//       const approveReq = new sql.Request(transaction);
//       await approveReq
//         .input("CompanyCode", sql.Int, payload.companyCode)
//         .input("GoodsOutPassCode", sql.Int, payload.id).query(`
//           UPDATE tbl_GateEntryGoodsOut
//           SET Approval_Stage2 = 1
//           WHERE CompanyCode = @CompanyCode
//             AND GoodsOutPassCode = @GoodsOutPassCode
//         `);

//       await rejectReq.query(`
//           EXEC sp_GateEntry_GoodsOut_Approval_Stage2_Pending @CompanyCode = ${payload.companyCode};
//           UPDATE tbl_DashBoard
//           SET Store_GatePassApprovalPending_Stage2 = @@ROWCOUNT;
//         `);

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, payload?.id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "STORES")
//         .input("subModuleName", sql.NVarChar, "Store Goods Out Approval 2")
//         .execute("web_sp_Notification_Update");

//       await transaction.commit();
//       return res.status(200).json({
//         success: true,
//         message:
//           payload.message || "Store Goods Out Stage 2 Approved Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Stage 2 approval process failed.",
//       });
//     }
//   } catch (err) {
//     console.error("Outer Error:", err);
//     return res.status(500).json({
//       success: false,
//       error: err.message,
//     });
//   }
// };

// // GET list FUnctions

// export const getPurchaseAdviceApproveOverview = async (req, res) => {
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
//       .input("PurchaseAdviceCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_PurchaseAdvice_GetAll");

//     let detailedResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("PurchaseAdviceCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_PurchaseAdviceDetails_GetAll");
//     const totalAmount = detailedResult?.recordset.reduce(
//       (sum, item) => sum + (item.Amount || 0),
//       0
//     );
//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       basicAmount: totalAmount,
//       id: mainResult?.recordsets?.[0]?.[0]?.PurchaseAdviceCode,
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

// export const getPurchaseOrderApprove1Overview = async (req, res) => {
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
//       .input("PurchaseOrderCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_PurchaseOrder_GetAll");

//     let detailedResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("PurchaseOrderCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_PurchaseOrderDetails_GetAll");

//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       id: mainResult?.recordsets?.[0]?.[0]?.PurchaseOrderCode,
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

// export const getPurchaseOrderApprove2Overview = async (req, res) => {
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
//       .input("PurchaseOrderCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_PurchaseOrder_GetAll");

//     let detailedResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("PurchaseOrderCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_PurchaseOrderDetails_GetAll");

//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       id: mainResult?.recordsets?.[0]?.[0]?.PurchaseOrderCode,
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
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getPurchaseOrderApprove3Overview = async (req, res) => {
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
//       .input("PurchaseOrderCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_PurchaseOrder_GetAll");

//     let detailedResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("PurchaseOrderCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_PurchaseOrderDetails_GetAll");

//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       id: mainResult?.recordsets?.[0]?.[0]?.PurchaseOrderCode,
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

//     // Execute the stored procedure
//     let mainResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("PurchaseOrderReceivedCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_PurchaseOrderReceived_GetAll");

//     let detailedResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("PurchaseOrderReceivedCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_RptPurchaseOrderReceivedDetails");

//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       id: mainResult?.recordsets?.[0]?.[0]?.PurchaseOrderReceivedCode,
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

// export const getGoodsInApprovalOverview = async (req, res) => {
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
//       .input("GoodsInPassCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_GateEntryGoodsIn_GetAll");

//     let detailedResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("GoodsInPassCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_GateEntryGoodsInDetails_GetAll");

//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       id: mainResult?.recordsets?.[0]?.[0]?.GoodsInPassCode,
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

// export const getGoodsOutApproval1Overview = async (req, res) => {
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

// export const getGoodsOutApproval2Overview = async (req, res) => {
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

// 17 functions

import { log } from "console";
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
export const storePurchaseAdviceApproval = async (req, res) => {
  const bodyData = req.body;
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { FYCode, nodeCode, userId } = req.headers;

    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const dashboardResult = await pool
        .request()
        .query(
          "SELECT Stores_Purchase_Adivce_Approval_Pendings FROM tbl_Dashboard",
        );

      const pendingValue =
        dashboardResult.recordset?.[0]
          ?.Stores_Purchase_Adivce_Approval_Pendings || 0;

      const request1 = new sql.Request(transaction);
      applyBranchCode(request1, req.headers); // 👈 Fix applied
      const subdbname = showBranchDropDown(req.headers.subdbname);
      if (subdbname) {
        request1.input(
          "PurchaseAdviceCode",
          sql.Int,
          bodyData?.purchaseAdviceCode,
        );
      }

      const getApprovaltNo = await request1
        // .input("CompanyCode", sql.Int, parseInt(bodyData?.companyCode))
        .input("FYCode", sql.Int, parseInt(FYCode))
        .execute("sp_PurchaseAdviceApprove_PurchaseAdviceApproveNo");

      const request2 = new sql.Request(transaction);
      applyBranchCode(request2, req.headers); // 👈 Fix applied

      const purchaseAdviceApprove = await request2
        .input(
          "PurchaseAdviceApproveDate",
          sql.DateTime,
          new Date(bodyData?.approvalDate),
        )
        .input(
          "PurchaseAdviceApproveNo",
          sql.Int,
          getApprovaltNo.recordset[0]["PurchaseAdviceApproveNo"],
        )
        .input("PurchaseAdviceCode", sql.Int, bodyData?.purchaseAdviceCode)
        .input("PurchaseModeCode", sql.Int, bodyData?.purchaseModeCode)
        .input("SupplierCode", sql.Int, bodyData?.supplierCode)
        .input("PurchaseTypeCode", sql.Int, bodyData?.purchaseTypeCode)
        .input("TotalQty", sql.Numeric(12, 2), bodyData?.totalQty)
        .input("TotalAmount", sql.Numeric(12, 2), bodyData?.totalAmount)
        .input("TotalDiscountper", sql.Numeric(12, 2), bodyData?.totalDiscountper)
        .input("TotalDiscountAmount", sql.Numeric(12, 2), bodyData?.totalDiscountAmount)
        .input("TotalGrossAmount", sql.Numeric(12, 2), bodyData?.totalGrossAmount)
        .input("TotalTaxPer", sql.Numeric(12, 2), bodyData?.totalTaxPer)
        .input("TotalTaxAmount", sql.Numeric(12, 2), bodyData?.totalTaxAmount)
        .input("TotalCSTPer", sql.Numeric(12, 2), bodyData?.totalCSTPer)
        .input("TotalCSTAmount", sql.Numeric(12, 2), bodyData?.totalCSTAmount)
        .input("TotalPFPer", sql.Numeric(12, 2), bodyData?.totalPFPer)
        .input("TotalPFAmount", sql.Numeric(12, 2), bodyData?.totalPFAmount)
        .input("TotalCGSTAmount", sql.Numeric(12, 2), bodyData?.totalCGSTAmount)
        .input("TotalCGSTPer", sql.Numeric(12, 2), bodyData?.totalCGSTPer)
        .input("TotalSGSTAmount", sql.Numeric(12, 2), bodyData?.totalSGSTAmount)
        .input("TotalSGSTPer", sql.Numeric(12, 2), bodyData?.totalSGSTPer)
        .input("TotalIGSTAmount", sql.Numeric(12, 2), bodyData?.totalIGSTAmount)
        .input("TotalIGSTPer", sql.Numeric(12, 2), bodyData?.totalIGSTPer)
        .input("TotalOtherExpenses", sql.Numeric(12, 2), bodyData?.totalOtherExpenses)
        .input("TotalTCSAmount", sql.Numeric(12, 2), bodyData?.totalTCSAmount)
        .input("TotalRoundedOff", sql.Numeric(12, 2), bodyData?.totalRoundedOff)
        .input("TotalNetAmount", sql.Numeric(12, 2), bodyData?.totalNetAmount)
        .input("Remarks", sql.NVarChar(500), bodyData?.remarks || "")
        .input("Reject", sql.Int, bodyData?.reject)
        .input("RefNo", sql.NVarChar(500), bodyData?.refNo)
        .input("FYCode", sql.Int, FYCode)
        // .input("CompanyCode", sql.Int, bodyData?.companyCode)
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode)
        .execute("sp_PurchaseAdviceApprove_AddEdit");

      const request3 = new sql.Request(transaction);
      // applyBranchCode(request3, req.headers); // 👈 Fix applied
      await request3
        .input("CompanyCode", sql.Int, parseInt(bodyData?.companyCode))
        .input(
          "PurchaseAdviceApproveCode",
          sql.Int,
          parseInt(purchaseAdviceApprove.recordset[0][""]),
        )
        .execute("sp_PurchaseAdviceApproveDetails_Delete");

      // Notification Update
      const request4 = new sql.Request(transaction);
      applyBranchCode(request4, req.headers); // 👈 Fix applied
      if (request4.parameters && request4.parameters.CompanyCode) {
        delete request4.parameters.CompanyCode;
      }
      await request4
        .input("ApprovalID", sql.Int, bodyData?.purchaseAdviceCode)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "STORES")
        .input("subModuleName", sql.NVarChar, "Store Purchase Advice Approval")
        .execute("web_sp_Notification_Update");

      await transaction.commit();

      await pool.request().query(`
        UPDATE tbl_DashBoard
        SET Stores_Purchase_Adivce_Approval_Pendings = ${pendingValue > 0 ? pendingValue - 1 : 0};
      `);

      return res.status(201).json({
        data: purchaseAdviceApprove,
        success: true,
        message: bodyData?.reject
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

export const purchaseAdviceApproveDetails = async (req, res) => {
  const bodyData = req.body;
  let transaction;
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { FYCode, nodeCode, userId } = req.headers;

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      // applyBranchCode(request, req.headers); // 👈 Fix applied

      await request
        .input("SNo", sql.Int, bodyData?.sNo)
        .input(
          "PurchaseAdviceApproveCode",
          sql.Int,
          bodyData?.purchaseAdviceApprove,
        )
        .input("CostHeadCode", sql.Int, bodyData?.costHeadCode)
        .input("DepartmentCode", sql.Int, bodyData?.departmentCode)
        .input("EmployeeCode", sql.Int, bodyData?.employeeCode)
        .input("ItemCode", sql.Int, bodyData?.itemCode)
        .input("Qty",  sql.Numeric(12, 2), bodyData?.qty)
        .input("Rate",  sql.Numeric(12, 2), bodyData?.rate)
        .input("Amount",  sql.Numeric(12, 2), bodyData?.amount)
        .input("DiscountPer", sql.Numeric(12, 2), bodyData?.discountPer)
        .input("DiscountPerRate", sql.Numeric(12, 2), bodyData?.discountPerRate)
        .input("DiscountAmount", sql.Numeric(12, 2), bodyData?.discountAmount)
        .input("GrossAmount", sql.Numeric(12, 2), bodyData?.grossAmount)
        .input("TaxPer", sql.Numeric(12, 2), bodyData?.taxPer)
        .input("TaxAmount", sql.Numeric(12, 2), bodyData?.taxAmount)
        .input("CSTPer", sql.Numeric(12, 2), bodyData?.cstPer)
        .input("CSTAmount", sql.Numeric(12, 2), bodyData?.cstAmount)
        .input("CGSTPer", sql.Numeric(12, 2), bodyData?.cgstPer)
        .input("CGSTAmount", sql.Numeric(12, 2), bodyData?.cgstAmount)
        .input("SGSTPer", sql.Numeric(12, 2), bodyData?.sgstPer)
        .input("SGSTAmount", sql.Numeric(12, 2), bodyData?.sgstAmount)
        .input("IGSTPer", sql.Numeric(12, 2), bodyData?.igstPer)
        .input("IGSTAmount", sql.Numeric(12, 2), bodyData?.igstAmount)
        .input("PFPer", sql.Numeric(12, 2), bodyData?.pfPer)
        .input("PFAmount", sql.Numeric(12, 2), bodyData?.pfAmount)
        .input("TCSAmount", sql.Numeric(12, 2), bodyData?.tcsAmount)
        .input("OtherExpenses", sql.Numeric(12, 2), bodyData?.otherExpenses)
        .input("RoundedOff", sql.Numeric(12, 2), bodyData?.roundedOff)
        .input("NetAmount", sql.Numeric(12, 2), bodyData?.netAmount)
        .input("CompanyCode", sql.Int, bodyData?.companyCode)
        .input("Reason", sql.NVarChar(500), bodyData?.reason || null);

      if (
        req.headers.subdbname === "KAS"
        // ||
        // req.headers.subdbname === "LOCALHOST"
      ) {
        request.input("IssueTypeCode", sql.Int, bodyData?.issueTypeCode);
        request.input("MachineCode", sql.Int, bodyData?.machineCode);
      }
      await request.execute("sp_PurchaseAdviceApproveDetails_Insert");

      await transaction.commit();

      return res
        .status(201)
        .json({ success: true, message: "Approved Successfully!" });
    } catch (err) {
      if (transaction && !transaction._aborted) await transaction.rollback();
      if (err.message.includes("UK_"))
        return res
          .status(400)
          .json({ success: false, message: "Already Approved !" });
      return res.status(500).json({ success: false, error: err.message });
    }
  } catch (err) {
    if (transaction && transaction._aborted === false)
      await transaction.rollback();
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const storePurchaseOrderApproval = async (req, res) => {
  const bodyData = req.body;
  let transaction;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { userId, nodeCode } = req.headers;

    if (bodyData.reject === 1 && !bodyData.rejectReason) {
      return res.status(400).json({
        success: false,
        message: "Reject reason is required when rejecting.",
      });
    }

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const settingReq = new sql.Request(transaction);
    const settingsResult = await settingReq.query(
      `SELECT * FROM tbl_Setting WHERE SettingCode = 1`,
    );
    const settings = settingsResult.recordset?.[0] || {};
    const hasApproval2 = settings.PO_Approval_2 == 1;
    const hasApproval3 = settings.PO_Approval_3 == 1;

    const request1 = new sql.Request(transaction);
    // applyBranchCode(request1, req.headers); // 👈 Fix applied

    if (bodyData.reject === 1) {
      await request1
        .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
        .input("UserCode", sql.Int, userId)
        .input("NodeCode", sql.Int, nodeCode)
        .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason)
        .execute("sp_PurchaseOrder_Approval_1_Reject");
    } else {
      await request1
        .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
        .input("UserCode", sql.Int, userId)
        .input("NodeCode", sql.Int, nodeCode)
        .input("RejectReason", sql.NVarChar(500), "")
        .execute("sp_PurchaseOrder_Approval_1_Update");

      if (hasApproval2) {
        const request2 = new sql.Request(transaction);
        // applyBranchCode(request2, req.headers); // 👈 Fix applied
        await request2
          .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
          .input("UserCode", sql.Int, userId)
          .input("NodeCode", sql.Int, nodeCode)
          .input("RejectReason", sql.NVarChar(500), "")
          .execute("sp_PurchaseOrder_Approval_2_Update");
      }

      if (hasApproval3) {
        const request3 = new sql.Request(transaction);
        // applyBranchCode(request3, req.headers); // 👈 Fix applied
        await request3
          .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
          .input("UserCode", sql.Int, userId)
          .input("NodeCode", sql.Int, nodeCode)
          .input("RejectReason", sql.NVarChar(500), "")
          .execute("sp_PurchaseOrder_Approval_3_Update");
      }
    }

    const batchReq = new sql.Request(transaction);
    // applyBranchCode(batchReq, req.headers); // 👈 Fix applied
    await batchReq.batch(`
      EXEC sp_PurchaseOrder_Approval_1_Pendings
      UPDATE tbl_DashBoard
      SET Stores_PurchaseOrder_Approval_Pendings_Store = @@ROWCOUNT

      EXEC sp_PurchaseOrder_Approval_2_Pendings
      UPDATE tbl_DashBoard
      SET Stores_PurchaseOrder_Approval_Pendings_GM = @@ROWCOUNT
    `);

    const notifyReq = new sql.Request(transaction);
    applyBranchCode(notifyReq, req.headers); // 👈 Fix applied
    if (notifyReq.parameters && notifyReq.parameters.CompanyCode) {
      delete notifyReq.parameters.CompanyCode;
    }
    await notifyReq
      .input("ApprovalID", sql.Int, bodyData.purchaseOrderCode)
      .input("IsNotify", sql.Bit, 1)
      .input("IsRead", sql.Bit, 1)
      .input("IsApproved", sql.Bit, 1)
      .input("ModuleName", sql.NVarChar, "STORES")
      .input("subModuleName", sql.NVarChar, "Store Purchase Order Approval")
      .execute("web_sp_Notification_Update");

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message:
        bodyData.reject === 1
          ? "Purchase Order Rejected Successfully!"
          : "Purchase Order Approved Successfully!",
    });
  } catch (err) {
    if (transaction?._aborted === false) await transaction.rollback();
    return res.status(500).json({
      success: false,
      message: err.message || "Approval process failed",
    });
  }
};

export const storePurchaseOrderApprovalGM = async (req, res) => {
  const bodyData = req.body;
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { userId, nodeCode } = req.headers;

    if (bodyData.reject === 1 && !bodyData.rejectReason)
      return res
        .status(400)
        .json({ success: false, message: "Reject reason is required." });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const checkRequest = new sql.Request(transaction);
      const result = await checkRequest
        .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
        .query(
          `SELECT TotalNetAmount FROM tbl_PurchaseOrder WHERE PurchaseOrderCode = @PurchaseOrderCode`,
        );
      const totalNetAmount = result.recordset?.[0]?.TotalNetAmount || 0;

      const requestAction = new sql.Request(transaction);
      // applyBranchCode(requestAction, req.headers); // 👈 Fix applied

      if (bodyData.reject === 1) {
        await requestAction
          .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
          .input("UserCode", sql.Int, userId)
          .input("NodeCode", sql.Int, nodeCode)
          .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason)
          .execute("sp_PurchaseOrder_Approval_2_Reject");
      } else {
        await requestAction
          .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
          .input("UserCode", sql.Int, userId)
          .input("NodeCode", sql.Int, nodeCode)
          .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason || "")
          .execute("sp_PurchaseOrder_Approval_2_Update");

        if (totalNetAmount <= 50000 && req.headers.subdbname == "KAS") {
          const approval3Req = new sql.Request(transaction);
          // applyBranchCode(approval3Req, req.headers); // 👈 Fix applied
          await approval3Req
            .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
            .input("UserCode", sql.Int, userId)
            .input("NodeCode", sql.Int, nodeCode)
            .input(
              "RejectReason",
              sql.NVarChar(500),
              bodyData.rejectReason || "",
            )
            .execute("sp_PurchaseOrder_Approval_3_Update");
        }
      }

      const batchReq = new sql.Request(transaction);
      // applyBranchCode(batchReq, req.headers); // 👈 Fix applied
      await batchReq.batch(`
        EXEC sp_PurchaseOrder_Approval_2_Pendings
        UPDATE tbl_DashBoard
        SET Stores_PurchaseOrder_Approval_Pendings_GM = @@ROWCOUNT

        EXEC sp_PurchaseOrder_Approval_3_Pendings
        UPDATE tbl_DashBoard
        SET Stores_PurchaseOrder_Approval_Pendings_MD = @@ROWCOUNT
      `);

      const notifyReq = new sql.Request(transaction);
      applyBranchCode(notifyReq, req.headers); // 👈 Fix applied
      if (notifyReq.parameters && notifyReq.parameters.CompanyCode) {
        delete notifyReq.parameters.CompanyCode;
      }
      await notifyReq
        .input("ApprovalID", sql.Int, bodyData.purchaseOrderCode)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "STORES")
        .input(
          "subModuleName",
          sql.NVarChar,
          "Store Purchase Order Approval - GM",
        )
        .execute("web_sp_Notification_Update");

      await transaction.commit();
      return res.status(200).json({
        success: true,
        message:
          bodyData.reject === 1
            ? "PO Rejected Successfully!"
            : "PO Approved Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const storePurchaseOrderApprovalMD = async (req, res) => {
  const bodyData = req.body;
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { userId, nodeCode } = req.headers;

    if (bodyData.reject === 1 && !bodyData.rejectReason)
      return res
        .status(400)
        .json({ success: false, message: "Reject reason is required." });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const requestAction = new sql.Request(transaction);
      // applyBranchCode(requestAction, req.headers); // 👈 Fix applied

      if (bodyData.reject === 1) {
        await requestAction
          .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
          .input("UserCode", sql.Int, userId)
          .input("NodeCode", sql.Int, nodeCode)
          .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason)
          .execute("sp_PurchaseOrder_Approval_3_Reject");
      } else {
        await requestAction
          .input("PurchaseOrderCode", sql.Int, bodyData.purchaseOrderCode)
          .input("UserCode", sql.Int, userId)
          .input("NodeCode", sql.Int, nodeCode)
          .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason || "")
          .execute("sp_PurchaseOrder_Approval_3_Update");
      }

      const notifyReq = new sql.Request(transaction);
      applyBranchCode(notifyReq, req.headers); // 👈 Fix applied
      if (notifyReq.parameters && notifyReq.parameters.CompanyCode) {
        delete notifyReq.parameters.CompanyCode;
      }
      await notifyReq
        .input("ApprovalID", sql.Int, bodyData.purchaseOrderCode)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "STORES")
        .input(
          "subModuleName",
          sql.NVarChar,
          "Store Purchase Order Approval - MD",
        )
        .execute("web_sp_Notification_Update");

      const batchReq = new sql.Request(transaction);
      // applyBranchCode(batchReq, req.headers); // 👈 Fix applied
      await batchReq.batch(`
        EXEC sp_PurchaseOrder_Approval_3_Pendings
        UPDATE tbl_DashBoard
        SET Stores_PurchaseOrder_Approval_Pendings_MD = @@ROWCOUNT
      `);

      await transaction.commit();
      return res.status(200).json({
        success: true,
        message:
          bodyData.reject === 1
            ? "PO Rejected Successfully!"
            : "PO Approved Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const storeBillPassingApproval = async (req, res) => {
  const bodyData = req.body;
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
      if (bodyData.reject === 1 && !bodyData.remarks)
        return res.status(400).json({
          success: false,
          message: "Remarks are required for rejection!",
        });

      const request1 = new sql.Request(transaction);
      // applyBranchCode(request1, req.headers); // 👈 Fix applied
      await request1
        .input("ApprovalDate", sql.DateTime, new Date(bodyData?.approvalDate))
        .input("PurchaseOrderReceivedCode", sql.Int, bodyData?.id)
        .input("Reject", sql.Int, bodyData?.reject || 0)
        .input("Remarks", sql.NVarChar(500), bodyData?.remarks || "")
        .input("FYCode", sql.Int, FYCode)
        .input("CompanyCode", sql.Int, bodyData?.companyCode)
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode)
        .execute("sp_StoresGRNApproval_Insert");

      if (bodyData.reject === 1) {
        const request2 = new sql.Request(transaction);
        // applyBranchCode(request2, req.headers); // 👈 Fix applied
        await request2
          .input("PurchaseOrderReceivedCode", sql.Int, bodyData?.id)
          .input("CompanyCode", sql.Int, bodyData?.companyCode)
          .execute("sp_StoresGRN_Reject");

        const inwardResult = await transaction
          .request()
          .query(
            `SELECT * FROM vw_PurchaseOrderReceivedDetails WHERE PurchaseOrderReceivedCode = ${bodyData?.id}`,
          );
        const inwardDetails = inwardResult.recordset;

        if (inwardDetails.length > 0) {
          let taxTypeCode = 6;
          if (req.headers.subdbname == "KAS") taxTypeCode = 7;

          const debitNoteReq = new sql.Request(transaction);
          applyBranchCode(debitNoteReq, req.headers); // 👈 Fix applied
          const debitNoteResult = await debitNoteReq
            // .input("CompanyCode", sql.Int, bodyData?.companyCode)
            .input("FYCode", sql.Int, FYCode)
            .execute("sp_DebitNote_DebitNoteNo");
          const debitNoteNo =
            debitNoteResult.recordset?.[0]?.DebitNoteNo || null;

          const debitAddReq = new sql.Request(transaction);
          applyBranchCode(debitAddReq, req.headers); // 👈 Fix applied
          const debitAdd = await debitAddReq
            .input("User", sql.Int, userId)
            .input("Node", sql.Int, nodeCode)
            .input("DebitNoteNo", sql.Int, debitNoteNo)
            .input("DebitNoteDate", sql.DateTime, bodyData?.approvalDate)
            .input("RefType", sql.NVarChar(50), "STORES")
            .input("SupplierCode", sql.Int, inwardDetails?.[0]?.SupplierCode)
            .input("DebitTypeCode", sql.Int, 3)
            .input(
              "RefCode",
              sql.Int,
              inwardDetails?.[0]?.PurchaseOrderReceivedCode,
            )
            .input(
              "SupplierRefNo",
              sql.Int,
              inwardDetails?.[0]?.PurchaseOrderReceivedNo,
            )
            .input("TaxTypeCode", sql.Int, taxTypeCode)
            .input(
              "TotalBasicAmount",
              sql.Decimal(18, 2),
              inwardDetails?.[0]?.TotalGrossAmount,
            )
            .input(
              "TotalCGSTAmount",
              sql.Decimal(18, 2),
              inwardDetails?.[0]?.TotalCGSTAmount,
            )
            .input(
              "TotalSGSTAmount",
              sql.Decimal(18, 2),
              inwardDetails?.[0]?.TotalSGSTAmount,
            )
            .input(
              "TotalIGSTAmount",
              sql.Decimal(18, 2),
              inwardDetails?.[0]?.TotalIGSTAmount,
            )
            .input(
              "TotalDebitAmount",
              sql.Decimal(18, 2),
              inwardDetails?.[0]?.TotalNetAmount,
            )
            .input(
              "TotalAdjustmentAmount",
              sql.Decimal(18, 2),
              bodyData?.totalAdjustmentAmount,
            )
            .input(
              "TotalNetAmount",
              sql.Decimal(18, 2),
              inwardDetails?.[0]?.TotalNetAmount,
            )
            .input("Remarks", sql.NVarChar(500), bodyData?.remarks || "")
            .input("Reject", sql.Int, 0)
            .input("FYCode", sql.Int, FYCode)
            // .input("CompanyCode", sql.Int, bodyData?.companyCode)
            .execute("sp_DebitNote_AddEdit");

          const debitNoteCode = debitAdd.recordset?.[0]?.DebitNoteCode;

          const delReq = new sql.Request(transaction);
          applyBranchCode(delReq, req.headers); // 👈 Fix applied
          await delReq
            .input("DebitNoteCode", sql.Int, debitNoteCode)
            .input("CompanyCode", sql.Int, bodyData?.companyCode)
            .execute("sp_DebitNoteDetails_Delete");

          const insReq = new sql.Request(transaction);
          // applyBranchCode(insReq, req.headers); // 👈 Fix applied
          await insReq
            .input("DebitNoteCode", sql.Int, debitNoteCode)
            .input("RefType", sql.NVarChar(50), "STORES")
            .input(
              "RefCode",
              sql.Int,
              inwardDetails?.[0]?.PurchaseOrderReceivedCode,
            )
            .input(
              "BillNo",
              sql.Int,
              inwardDetails?.[0]?.PurchaseOrderReceivedNo,
            )
            .input(
              "BillDate",
              sql.DateTime,
              inwardDetails?.[0]?.PurchaseOrderReceivedDate,
            )
            .input(
              "BasicAmount",
              sql.Decimal(18, 2),
              inwardDetails?.[0]?.GrossAmount,
            )
            .input("CGSTPer", sql.Decimal(5, 2), inwardDetails?.[0]?.CGSTPer)
            .input("SGSTPer", sql.Decimal(5, 2), inwardDetails?.[0]?.SGSTPer)
            .input("IGSTPer", sql.Decimal(5, 2), inwardDetails?.[0]?.IGSTPer)
            .input(
              "CGSTAmount",
              sql.Decimal(18, 2),
              inwardDetails?.[0]?.TotalCGSTAmount,
            )
            .input(
              "SGSTAmount",
              sql.Decimal(18, 2),
              inwardDetails?.[0]?.TotalSGSTAmount,
            )
            .input(
              "IGSTAmount",
              sql.Decimal(18, 2),
              inwardDetails?.[0]?.TotalIGSTAmount,
            )
            .input(
              "Amount",
              sql.Decimal(18, 2),
              inwardDetails?.[0]?.TotalNetAmount,
            )
            .input("CompanyCode", sql.Int, bodyData?.companyCode)
            .execute("sp_DebitNoteDetails_Insert");
        }
      }

      const notifyReq = new sql.Request(transaction);
      applyBranchCode(notifyReq, req.headers); // 👈 Fix applied
      if (notifyReq.parameters && notifyReq.parameters.CompanyCode) {
        delete notifyReq.parameters.CompanyCode;
      }
      await notifyReq
        .input("ApprovalID", sql.Int, bodyData?.id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "STORES")
        .input("subModuleName", sql.NVarChar, "Store Bill Passing Approval")
        .execute("web_sp_Notification_Update");

      const batchReq = new sql.Request(transaction);
      applyBranchCode(batchReq, req.headers); // 👈 Fix applied
      await batchReq.batch(`
        EXEC sp_GRNApproval_GetPendings @CompanyCode = ${bodyData?.companyCode}
        UPDATE tbl_DashBoard
        SET Stores_BillPassing_Pendings = @@ROWCOUNT
      `);

      await transaction.commit();
      return res.status(200).json({
        success: true,
        message:
          bodyData.reject === 1
            ? "Rejected Successfully!"
            : "Approved Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      return res.status(500).json({
        success: false,
        message: "Transaction Failed",
        error: err.message,
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const storeGoodsInApproval = async (req, res) => {
  const bodyData = req.body;
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      if (bodyData.reject === 1) {
        await request
          // .input("CompanyCode", sql.Int, bodyData.companyCode)
          .input("GoodsInPassCode", sql.Int, bodyData.id)
          .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason || "")
          .query(`
            UPDATE tbl_GateEntryGoodsIn
            SET Cancel = 1, StoreInDate = GETDATE(), Store_InTime = CONVERT(VARCHAR(8), GETDATE(), 108)
            WHERE CompanyCode = @CompanyCode AND GoodsInPassCode = @GoodsInPassCode
          `);
      } else {
        await request
          // .input("CompanyCode", sql.Int, bodyData.companyCode)
          .input("GoodsInPassCode", sql.Int, bodyData.id).query(`
            UPDATE tbl_GateEntryGoodsIn
            SET StoreInDate = GETDATE(), Store_InTime = CONVERT(VARCHAR(8), GETDATE(), 108)
            WHERE CompanyCode = @CompanyCode AND GoodsInPassCode = @GoodsInPassCode
          `);
      }

      await request.query(`
        UPDATE A
        SET A.Stores_GoodsIn_Pendings = B.Nos
        FROM tbl_DashBoard A,
        (SELECT ISNULL(COUNT(GoodsPassNumber), 0) AS Nos FROM tbl_GateEntryGoodsIn WHERE StoreInDate IS NULL) B
        WHERE A.DashBoardCode = 1
      `);

      const notifyReq = new sql.Request(transaction);
      applyBranchCode(notifyReq, req.headers); // 👈 Fix applied
      if (notifyReq.parameters && notifyReq.parameters.CompanyCode) {
        delete notifyReq.parameters.CompanyCode;
      }
      await notifyReq
        .input("ApprovalID", sql.Int, bodyData?.id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "STORES")
        .input("subModuleName", sql.NVarChar, "Store Goods In Approval")
        .execute("web_sp_Notification_Update");

      await transaction.commit();
      return res.status(200).json({
        success: true,
        message:
          bodyData.reject === 1
            ? "Store Goods In Rejected!"
            : "Store Goods In Approved!",
      });
    } catch (err) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const storeGoodsOutApprovalOne = async (req, res) => {
  const bodyData = req.body;
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    if (bodyData.reject === 1 && !bodyData.rejectReason)
      return res
        .status(400)
        .json({ success: false, message: "Reject reason is required." });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      if (bodyData.reject === 1) {
        await request
          // .input("CompanyCode", sql.Int, bodyData.companyCode)
          .input("GoodsOutPassCode", sql.Int, bodyData.id)
          .input("RejectReason", sql.NVarChar(500), bodyData.rejectReason || "")
          .query(`
            UPDATE tbl_GateEntryGoodsOut
            SET Cancel = 1, CancelReason = @RejectReason
            WHERE CompanyCode = @CompanyCode AND GoodsOutPassCode = @GoodsOutPassCode
          `);
      } else {
        const settingReq = new sql.Request(transaction);
        const settingResult = await settingReq.query(
          `SELECT GoodsOut_Approval FROM tbl_Setting WHERE GoodsOut_Approval = 0`,
        );
        const hasSetting = settingResult.recordset.length > 0;

        if (hasSetting) {
          await request
            // .input("CompanyCode", sql.Int, bodyData.companyCode)
            .input("GoodsOutPassCode", sql.Int, bodyData.id).query(`
            UPDATE tbl_GateEntryGoodsOut
            SET Approval_Stage1 = 1, Approval_Stage2 = 1, GateOutDate = GETDATE(), OutTime = CONVERT(VARCHAR(8), GETDATE(), 108)
            WHERE CompanyCode = @CompanyCode AND GoodsOutPassCode = @GoodsOutPassCode
          `);
        } else {
          await request
            // .input("CompanyCode", sql.Int, bodyData.companyCode)
            .input("GoodsOutPassCode", sql.Int, bodyData.id).query(`
            UPDATE tbl_GateEntryGoodsOut
            SET Approval_Stage1 = 1
            WHERE CompanyCode = @CompanyCode AND GoodsOutPassCode = @GoodsOutPassCode
          `);
        }
      }

      await request.query(`
        EXEC sp_GateEntry_GoodsOut_Approval_Stage1_Pending @CompanyCode = ${bodyData.companyCode};
        UPDATE tbl_DashBoard SET Store_GatePassApprovalPending_Stage1 = @@ROWCOUNT;
      `);

      const notifyReq = new sql.Request(transaction);
      applyBranchCode(notifyReq, req.headers); // 👈 Fix applied
      if (notifyReq.parameters && notifyReq.parameters.CompanyCode) {
        delete notifyReq.parameters.CompanyCode;
      }
      await notifyReq
        .input("ApprovalID", sql.Int, bodyData?.id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "STORES")
        .input("subModuleName", sql.NVarChar, "Store Goods Out Approval 1")
        .execute("web_sp_Notification_Update");

      await transaction.commit();
      return res.status(200).json({
        success: true,
        message: bodyData.reject === 1 ? "Rejected!" : "Approved!",
      });
    } catch (err) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const storeGoodsOutApprovalTwo = async (req, res) => {
  const payload = req.body;
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    if (payload.reject === 1 && !payload.rejectReason)
      return res
        .status(400)
        .json({ success: false, message: "Reject reason required." });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      if (payload.reject === 1) {
        await request
          // .input("CompanyCode", sql.Int, payload.companyCode)
          .input("GoodsOutPassCode", sql.Int, payload.id)
          .input("RejectReason", sql.NVarChar(500), payload.rejectReason || "")
          .query(`
            UPDATE tbl_GateEntryGoodsOut
            SET Cancel = 1, CancelReason = @RejectReason
            WHERE CompanyCode = @CompanyCode AND GoodsOutPassCode = @GoodsOutPassCode
          `);
      } else {
        await request
          // .input("CompanyCode", sql.Int, payload.companyCode)
          .input("GoodsOutPassCode", sql.Int, payload.id).query(`
            UPDATE tbl_GateEntryGoodsOut
            SET Approval_Stage2 = 1
            WHERE CompanyCode = @CompanyCode AND GoodsOutPassCode = @GoodsOutPassCode
          `);
      }

      await request.query(`
        EXEC sp_GateEntry_GoodsOut_Approval_Stage2_Pending @CompanyCode = ${payload.companyCode};
        UPDATE tbl_DashBoard SET Store_GatePassApprovalPending_Stage2 = @@ROWCOUNT;
      `);

      const notifyReq = new sql.Request(transaction);
      applyBranchCode(notifyReq, req.headers); // 👈 Fix applied
      if (notifyReq.parameters && notifyReq.parameters.CompanyCode) {
        delete notifyReq.parameters.CompanyCode;
      }
      await notifyReq
        .input("ApprovalID", sql.Int, payload?.id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "STORES")
        .input("subModuleName", sql.NVarChar, "Store Goods Out Approval 2")
        .execute("web_sp_Notification_Update");

      await transaction.commit();
      return res.status(200).json({
        success: true,
        message: payload.reject === 1 ? "Rejected!" : "Approved!",
      });
    } catch (err) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// GET LIST FUNCTIONS

export const getPurchaseAdviceApproveOverview = async (req, res) => {
  try {
    const { page = 1, pageSize = 5, companyCode } = req.query;
    const { id } = req.params;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("PurchaseAdviceCode", sql.Int, parseInt(id))
      .execute("web_sp_PurchaseAdvice_GetAll");

    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("PurchaseAdviceCode", sql.Int, parseInt(id))
      .execute("web_sp_PurchaseAdviceDetails_GetAll");

    const totalAmount = detailedResult?.recordset.reduce(
      (sum, item) => sum + (item.Amount || 0),
      0,
    );
    const addId = {
      ...mainResult?.recordsets?.[0]?.[0],
      basicAmount: totalAmount,
      id: mainResult?.recordsets?.[0]?.[0]?.PurchaseAdviceCode,
    };
    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + parseInt(pageSize),
    );

    res.status(200).json({
      totalRecords: detailedResult?.recordset.length,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
      data: { mainOutput: addId, detailedOutput: paginatedData },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getPurchaseOrderApprove1Overview = async (req, res) => {
  try {
    const { page = 1, pageSize = 5, companyCode } = req.query;
    const { id } = req.params;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("PurchaseOrderCode", sql.Int, parseInt(id))
      .execute("web_sp_PurchaseOrder_GetAll");

    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("PurchaseOrderCode", sql.Int, parseInt(id))
      .execute("web_sp_PurchaseOrderDetails_GetAll");

    const addId = {
      ...mainResult?.recordsets?.[0]?.[0],
      id: mainResult?.recordsets?.[0]?.[0]?.PurchaseOrderCode,
    };
    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + parseInt(pageSize),
    );

    res.status(200).json({
      totalRecords: detailedResult?.recordset.length,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
      data: { mainOutput: addId, detailedOutput: paginatedData },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getPurchaseOrderApprove2Overview = async (req, res) => {
  try {
    const { page = 1, pageSize = 5, companyCode } = req.query;
    const { id } = req.params;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("PurchaseOrderCode", sql.Int, parseInt(id))
      .execute("web_sp_PurchaseOrder_GetAll");

    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("PurchaseOrderCode", sql.Int, parseInt(id))
      .execute("web_sp_PurchaseOrderDetails_GetAll");

    const addId = {
      ...mainResult?.recordsets?.[0]?.[0],
      id: mainResult?.recordsets?.[0]?.[0]?.PurchaseOrderCode,
    };
    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + parseInt(pageSize),
    );

    res.status(200).json({
      totalRecords: detailedResult?.recordset.length,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
      data: { mainOutput: addId, detailedOutput: paginatedData },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getPurchaseOrderApprove3Overview = async (req, res) => {
  try {
    const { page = 1, pageSize = 5, companyCode } = req.query;
    const { id } = req.params;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("PurchaseOrderCode", sql.Int, parseInt(id))
      .execute("web_sp_PurchaseOrder_GetAll");

    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("PurchaseOrderCode", sql.Int, parseInt(id))
      .execute("web_sp_PurchaseOrderDetails_GetAll");

    const addId = {
      ...mainResult?.recordsets?.[0]?.[0],
      id: mainResult?.recordsets?.[0]?.[0]?.PurchaseOrderCode,
    };
    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + parseInt(pageSize),
    );

    res.status(200).json({
      totalRecords: detailedResult?.recordset.length,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
      data: { mainOutput: addId, detailedOutput: paginatedData },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getBillPassingOverview = async (req, res) => {
  try {
    const { page = 1, pageSize = 5, companyCode } = req.query;
    const { id } = req.params;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("PurchaseOrderReceivedCode", sql.Int, parseInt(id))
      .execute("web_sp_PurchaseOrderReceived_GetAll");

    const req2 = pool.request();
    // applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("PurchaseOrderReceivedCode", sql.Int, parseInt(id))
      .execute("web_sp_RptPurchaseOrderReceivedDetails");

    const addId = {
      ...mainResult?.recordsets?.[0]?.[0],
      id: mainResult?.recordsets?.[0]?.[0]?.PurchaseOrderReceivedCode,
    };
    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + parseInt(pageSize),
    );

    res.status(200).json({
      totalRecords: detailedResult?.recordset.length,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
      data: { mainOutput: addId, detailedOutput: paginatedData },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getGoodsInApprovalOverview = async (req, res) => {
  try {
    const { page = 1, pageSize = 5, companyCode } = req.query;
    const { id } = req.params;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("GoodsInPassCode", sql.Int, parseInt(id))
      .execute("web_sp_GateEntryGoodsIn_GetAll");

    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("GoodsInPassCode", sql.Int, parseInt(id))
      .execute("web_sp_GateEntryGoodsInDetails_GetAll");

    const addId = {
      ...mainResult?.recordsets?.[0]?.[0],
      id: mainResult?.recordsets?.[0]?.[0]?.GoodsInPassCode,
    };
    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + parseInt(pageSize),
    );

    res.status(200).json({
      totalRecords: detailedResult?.recordset.length,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
      data: { mainOutput: addId, detailedOutput: paginatedData },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getGoodsOutApproval1Overview = async (req, res) => {
  try {
    const { page = 1, pageSize = 5, companyCode } = req.query;
    const { id } = req.params;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("GoodsOutPassCode", sql.Int, parseInt(id))
      .execute("web_sp_GateEntryGoodsOut_GetAll");

    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("GoodsOutPassCode", sql.Int, parseInt(id))
      .execute("web_sp_GateEntryGoodsOutDetails_GetAll");

    const addId = {
      ...mainResult?.recordsets?.[0]?.[0],
      id: mainResult?.recordsets?.[0]?.[0]?.GoodsOutPassCode,
    };
    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + parseInt(pageSize),
    );

    res.status(200).json({
      totalRecords: detailedResult?.recordset.length,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
      data: { mainOutput: addId, detailedOutput: paginatedData },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getGoodsOutApproval2Overview = async (req, res) => {
  try {
    const { page = 1, pageSize = 5, companyCode } = req.query;
    const { id } = req.params;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("GoodsOutPassCode", sql.Int, parseInt(id))
      .execute("web_sp_GateEntryGoodsOut_GetAll");

    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(companyCode))
      .input("GoodsOutPassCode", sql.Int, parseInt(id))
      .execute("web_sp_GateEntryGoodsOutDetails_GetAll");

    const addId = {
      ...mainResult?.recordsets?.[0]?.[0],
      id: mainResult?.recordsets?.[0]?.[0]?.GoodsOutPassCode,
    };
    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + parseInt(pageSize),
    );

    res.status(200).json({
      totalRecords: detailedResult?.recordset.length,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
      data: { mainOutput: addId, detailedOutput: paginatedData },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
