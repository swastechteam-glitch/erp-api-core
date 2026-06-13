// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const employeeApproval = async (req, res) => {
//   const payload = req.body; // contains: employeeCode, reject, companyCode, message, etc.

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     const transaction = new sql.Transaction(pool);

//     try {
//       await transaction.begin();

//       const request = new sql.Request(transaction);
//       request
//         .input("EmployeeCode", sql.Int, payload.id)
//         .input("CompanyCode", sql.Int, payload.companyCode);

//       if (payload.reject === 1) {
//         await request.query(`
//           UPDATE tbl_Employee
//           SET Reject = 1,
//               Approval = 0
//           WHERE EmployeeCode = @EmployeeCode
//         `);
//       } else {
//         await request.query(`
//           UPDATE tbl_Employee
//           SET Reject = 0,
//               Approval = 1
//           WHERE EmployeeCode = @EmployeeCode
//         `);
//       }

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, payload.id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "PAYROLL")
//         .input("subModuleName", sql.NVarChar, "Employee Approval")
//         .execute("web_sp_Notification_Update");

//       await new sql.Request(transaction).query(`
//         UPDATE A
//         SET A.HR_Employee_Approval_Pending = B.Nos
//         FROM tbl_DashBoard A,
//           (SELECT ISNULL(COUNT(EmployeeCode), 0) AS Nos
//            FROM tbl_Employee
//            WHERE Approval = 0 AND Reject = 0) B
//         WHERE A.DashBoardCode = 1;
//       `);

//             await transaction.commit();

//       return res.status(200).json({
//         success: true,
//         message:
//           payload.message ||
//           (payload.reject
//             ? "Rejected Successfully!"
//             : "Approved Successfully!"),
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Employee approval process failed.",
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

// export const attendanceManualEntryApproval = async (req, res) => {
//   const payload = req.body;
//   // expected payload: { id, reject, companyCode, reason, message }

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

//       // 🔹 Execute Stored Procedure (Approval or Reject)
//       const request = new sql.Request(transaction);
//       request
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode)
//         .input("ManualCode", sql.Int, payload.id);

//       if (payload.reject === 1) {
//         request.input("Reject", sql.Int, 1);
//       } else {
//         request.input("Approval", sql.Int, 1);
//       }

//       const result = await request.execute("sp_ManualEntryApproval_AddEdit");

//       const request2 = new sql.Request(transaction);
//       await request2.batch(`
//             EXEC sp_ManualEntryApproval_Pendings
//             UPDATE tbl_DashBoard
//             SET HR_AttenManualEntry_ApprovalPendings = @@ROWCOUNT
//     `);

//     // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, payload.id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "PAYROLL")
//         .input("subModuleName", sql.NVarChar, "Attendance Manual Entry Approval")
//         .execute("web_sp_Notification_Update");

//       // ✅ Commit the transaction before making any new queries
//       await transaction.commit();

//       // 🔹 Update Dashboard Pending Counts (use a new request, not the transaction)
//       // const dashboardReq = new sql.Request(pool);
//       // await dashboardReq.batch(`
//       //   EXEC sp_ManualEntryApproval_Pendings;
//       //   UPDATE tbl_DashBoard
//       //   SET HR_AttenManualEntry_ApprovalPendings = @@ROWCOUNT;
//       // `);

//       return res.status(200).json({
//         success: true,
//         data: result.recordset || [],
//         message: payload.reject
//           ? "Manual Entry Rejected Successfully!"
//           : "Manual Entry Approved Successfully!",
//       });
//     } catch (err) {
//       // Rollback transaction if anything fails inside
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Attendance manual entry approval failed.",
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

// export const employeeWiseIncrementApproval = async (req, res) => {
//   const payload = req.body;
//   // expected payload: { id, reject, companyCode, reason, message }

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

//       // 🔹 Execute Stored Procedure (Approval or Reject)
//       const request = new sql.Request(transaction);
//       request
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode)
//         .input("IncrementCode", sql.Int, payload.id);

//       if (payload.reject === 1) {
//         request.input("Reject", sql.Int, 1);
//       } else {
//         request.input("Approval", sql.Int, 1);
//       }

//       const result = await request.execute("sp_IncrementApproval_AddEdit");

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, payload.id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "PAYROLL")
//         .input("subModuleName", sql.NVarChar, "Employee Wise Increment Approval")
//         .execute("web_sp_Notification_Update");

//       await transaction.commit();

//       // 🔹 Now run dashboard update in a separate request (not part of transaction)
//       const postRequest = new sql.Request(pool);
//       await postRequest.batch(`
//         EXEC sp_IncrementApproval_Pendings
//         UPDATE tbl_DashBoard
//         SET HR_EmpWiseIncrement_ApprovalPendings = @@ROWCOUNT
//       `);

//       return res.status(200).json({
//         success: true,
//         data: result.recordset || [],
//         message: payload.reject
//           ? "Manual Entry Rejected Successfully!"
//           : "Manual Entry Approved Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Attendance manual entry approval failed.",
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

// export const gradeWIseIncrementApproval = async (req, res) => {
//   const payload = req.body;

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

//       // 🔹 Execute Stored Procedure (Approval or Reject)
//       const request = new sql.Request(transaction);
//       request
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode)
//         .input("IncrementCode", sql.Int, payload.id);

//       if (payload.reject === 1) {
//         request.input("Reject", sql.Int, 1);
//       } else {
//         request.input("Approval", sql.Int, 1);
//       }

//       const result = await request.execute("sp_IncrementApproval_AddEdit");

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "PAYROLL")
//         .input("subModuleName", sql.NVarChar, "Grade Wise Increment Approval")
//         .execute("web_sp_Notification_Update");

//       await transaction.commit(); // ✅ commit first

//       // 🔹 Now run dashboard update in a separate request (not part of transaction)
//       const postRequest = new sql.Request(pool);
//       await postRequest.batch(`
//         EXEC sp_IncrementApproval_1_Pendings
//         UPDATE tbl_DashBoard
//         SET HR_GradeWiseIncrement_ApprovalPendings = @@ROWCOUNT
//       `);

//       return res.status(200).json({
//         success: true,
//         data: result.recordset || [],
//         message: payload.reject
//           ? "grade Wise Increment Rejected Successfully!"
//           : "grade Wise Approved Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Grade-wise increment approval failed.",
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

// export const onDutyEntryApprovalApproval = async (req, res) => {
//   const payload = req.body;

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

//       // Execute Stored Procedure (Approval or Reject)
//       const request = new sql.Request(transaction);
//       request
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode)
//         .input("OnDutyEntryCode", sql.Int, payload.id);

//       if (payload.reject === 1) {
//         request.input("Reject", sql.Int, 1);
//       } else {
//         request.input("Approval", sql.Int, 1);
//       }

//       const result = await request.execute("sp_OnDutyEntryApproval_AddEdit");

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, payload.id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "PAYROLL")
//         .input("subModuleName", sql.NVarChar, "Onduty Approval")
//         .execute("web_sp_Notification_Update");

//       await transaction.commit(); // ✅ commit first

//       // 🔹 Now run dashboard update in a separate request (not part of transaction)
//       const postRequest = new sql.Request(pool);
//       await postRequest.batch(`
//         EXEC sp_OnDutyEntryApproval_Pendings
//         UPDATE tbl_DashBoard
//         SET HR_OnDuty_ApprovalPendings = @@ROWCOUNT
//       `);

//       return res.status(200).json({
//         success: true,
//         data: result.recordset || [],
//         message: payload.reject
//           ? "OnDuty Rejected Successfully!"
//           : "OnDuty Approved Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Grade-wise OnDuty approval failed.",
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

// export const CompensationWorkEntryApproval = async (req, res) => {
//   const payload = req.body;

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

//       // Execute Stored Procedure (Approval or Reject)
//       const request = new sql.Request(transaction);
//       request
//         .input("User", sql.Int, userId)
//         .input("Node", sql.Int, nodeCode)
//         .input("CompensationWorkEntryCode", sql.Int, payload.id);

//       if (payload.reject === 1) {
//         request.input("Approval", sql.Int, 0);
//         request.input("Reject", sql.Int, 1);
//       } else {
//         request.input("Reject", sql.Int, 0);
//         request.input("Approval", sql.Int, 1);
//       }

//       const result = await request.execute(
//         "sp_CompensationWorkEntryApproval_AddEdit"
//       );

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, payload.id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "PAYROLL")
//         .input("subModuleName", sql.NVarChar, "Compensation Approval")
//         .execute("web_sp_Notification_Update");

//       await transaction.commit(); // ✅ commit first

//       // 🔹 Now run dashboard update in a separate request (not part of transaction)
//       const postRequest = new sql.Request(pool);
//       await postRequest.batch(`
//         EXEC sp_CompensationWorkEntryApproval_Pendings
//         UPDATE tbl_DashBoard
//         SET HR_Compensation_ApprovalPendings = @@ROWCOUNT
//       `);

//       return res.status(200).json({
//         success: true,
//         data: result.recordset || [],
//         message: payload.reject
//           ? "Compensation Approval Rejected Successfully!"
//           : "Compensation Approval Approved Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Grade-wise Compensation approval failed.",
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

// export const leaveEntryApproval = async (req, res) => {
//   const payload = req.body;

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

//       // Execute Stored Procedure (Approval or Reject)
//       const request = new sql.Request(transaction);
//       request
//         // .input("User", sql.Int, userId)
//         // .input("Node", sql.Int, nodeCode)
//         .input("LeaveEntryCode", sql.Int, payload.id);

//       if (payload.reject === 1) {
//         request.input("Approval", sql.Int, 0);
//         request.input("Reject", sql.Int, 1);
//       } else {
//         request.input("Reject", sql.Int, 0);
//         request.input("Approval", sql.Int, 1);
//       }

//       const result = await request.execute("sp_LeaveEntryApproval_AddEdit");

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, payload.id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "PAYROLL")
//         .input("subModuleName", sql.NVarChar, "Leave Approval")
//         .execute("web_sp_Notification_Update");

//       await transaction.commit();

//       const postRequest = new sql.Request(pool);
//       await postRequest.batch(`
//         EXEC sp_LeaveEntryApproval_Pendings
//         UPDATE tbl_DashBoard
//         SET HR_Leave_ApprovalPendings = @@ROWCOUNT
//       `);

//       return res.status(200).json({
//         success: true,
//         data: result.recordset || [],
//         message: payload.reject
//           ? "Leave Rejected Successfully!"
//           : "Leave Approved Successfully!",
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Grade-wise increment approval failed.",
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

// // Get List Functions

// export const getEmployeeApproveOverview = async (req, res) => {
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

//     const employeeCode = parseInt(paramId?.id);
//     const companyCode = parseInt(paramData?.companyCode);

//     // ---- Main Employee Info (your base procedure)
//     let mainResult = await pool
//       .request()
//       .input("EmployeeCode", sql.Int, employeeCode)
//       .execute("web_sp_Employee_GetAll_Photo");

//     const totalRecords = mainResult?.recordset?.length || 0;
//     const employeeInfo = {
//       ...mainResult.recordset?.[0],
//       id: mainResult.recordset?.[0]?.EmployeeCode,
//     };

//     // ---- Photo Table (direct SELECT query)
//     let photoResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, companyCode)
//       .input("EmployeeCode", sql.Int, employeeCode)
//       .query(
//         "SELECT Photo FROM tbl_Employee_Photo WHERE CompanyCode = @CompanyCode AND EmployeeCode = @EmployeeCode"
//       );

//     const employeePhoto = photoResult?.recordset?.[0]?.Photo || null;

//     // ---- Experience Table (stored procedure)
//     let expResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, companyCode)
//       .input("EmployeeCode", sql.Int, employeeCode)
//       .execute("web_sp_EmployeeExp_GetAll");

//     const employeeExperience = expResult?.recordset || [];

//     // ---- Family Details Table (stored procedure)
//     let familyResult = await pool
//       .request()
//       .input("EmployeeCode", sql.Int, employeeCode)
//       .execute("web_sp_EmployeeFamily_GetAll");

//     const employeeFamily = familyResult?.recordset || [];

//     // ---- Final Response
//     res.status(200).json({
//       totalRecords,
//       currentPage: page,
//       pageSize,
//       totalPages: Math.ceil(totalRecords / pageSize),
//       data: {
//         ...employeeInfo,
//         photo: employeePhoto,
//         experience: employeeExperience,
//         family: employeeFamily,
//       },
//     });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { applyBranchCode } from "../utils/common.js";

// ✅ Helper to safely extract and apply BranchCode
// const applyBranchCode = (request, headers) => {
//   const bCode = headers["branchCode"] || headers["branchcode"];
//   const companyCode = headers["companyCode"] || headers["companyCode"];
//   console.log(companyCode, "companyCode 98799");

//   if (bCode && headers.subdbname == "KPF") {
//     request.input("BranchCode", sql.Int, parseInt(bCode));
//   }
//   if (companyCode) {
//     request.input("CompanyCode", sql.Int, parseInt(companyCode));
//   }
// };

export const approveWasteInvoice = async (req, res) => {
  try {
    // 1. Validate Database Header
    if (!req.headers.subdbname) {
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });
    }

    // 2. Extract values from the request body and headers
    const { id } = req.body;

    // Safety check for case-sensitivity on headers
    const fyCode = req.headers.FYCode || req.headers.fycode;
    const node = req.headers.nodeCode || req.headers.nodecode;
    const user = req.headers.userId || req.headers.userid;
    const companyCode = req.headers.companyCode || req.headers.companycode;

    if (!id || !companyCode) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: id or companyCode",
      });
    }

    // 3. Setup DB Connection
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // 🌟 FIX: Create a Local Time String (YYYY-MM-DD HH:mm:ss)
    const now = new Date();
    const localDateString =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0") +
      " " +
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0") +
      ":" +
      String(now.getSeconds()).padStart(2, "0");

    // 4. Bind Input Parameters
    request.input("ApprovalDate", localDateString); // Passed as a string!
    request.input("WasteInvoiceCode", id);
    request.input("CompanyCode", companyCode);
    request.input("User", user || 1);
    request.input("Node", node || 1);
    request.input("FYCode", fyCode || 12);

    // 5. Execute the Stored Procedure
    await request.execute("sp_WasteInvoice_Approval_Insert");

    // 6. Send Success Response
    res.status(200).json({
      success: true,
      message: "Waste Invoice approved successfully",
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
// export const employeeApproval = async (req, res) => {
//   const payload = req.body; // contains: employeeCode, reject, companyCode, message, etc.

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     const transaction = new sql.Transaction(pool);

//     try {
//       await transaction.begin();

//       const request = new sql.Request(transaction);
//       applyBranchCode(request, req.headers); // 👈 Fix applied

//       request.input("EmployeeCode", sql.Int, payload.id);
//       // .input("CompanyCode", sql.Int, payload.companyCode);

//       if (payload.reject === 1) {
//         await request.query(`
//           UPDATE tbl_Employee
//           SET Reject = 1,
//               Approval = 0
//           WHERE EmployeeCode = @EmployeeCode
//         `);
//       } else {
//         await request.query(`
//           UPDATE tbl_Employee
//           SET Reject = 0,
//               Approval = 1
//           WHERE EmployeeCode = @EmployeeCode
//         `);
//       }

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       applyBranchCode(request3, req.headers); // 👈 Fix applied
//       if (request3.parameters && request3.parameters.CompanyCode) {
//         delete request3.parameters.CompanyCode;
//       }
//       await request3
//         .input("ApprovalID", sql.Int, payload.id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "PAYROLL")
//         .input("subModuleName", sql.NVarChar, "Employee Approval")
//         .execute("web_sp_Notification_Update");

//       // Dashboard Update
//       const dashReq = new sql.Request(transaction);
//       // applyBranchCode(dashReq, req.headers); // Optional depending on if dashboard logic needs branch
//       await dashReq.query(`
//         UPDATE A 
//         SET A.HR_Employee_Approval_Pending = B.Nos 
//         FROM tbl_DashBoard A, 
//           (SELECT ISNULL(COUNT(EmployeeCode), 0) AS Nos  
//            FROM tbl_Employee 
//            WHERE Approval = 0 AND Reject = 0) B
//         WHERE A.DashBoardCode = 1;
//       `);

//       await transaction.commit();

//       return res.status(200).json({
//         success: true,
//         message:
//           payload.message ||
//           (payload.reject
//             ? "Rejected Successfully!"
//             : "Approved Successfully!"),
//       });
//     } catch (err) {
//       await transaction.rollback();
//       console.error("Transaction Error:", err);
//       return res.status(500).json({
//         success: false,
//         message: err.message || "Employee approval process failed.",
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


export const employeeApproval = async (req, res) => {
  const payload = req.body; // contains: employeeCode, reject, companyCode, message, salary, etc.
  console.log(payload, 7878778);
  
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      request.input("EmployeeCode", sql.Int, payload.id);
      
      // Main Employee Update
      if (payload.reject === 1) {
        await request.query(`
          UPDATE tbl_Employee
          SET Reject = 1,
              Approval = 0
          WHERE EmployeeCode = @EmployeeCode
        `);
      } else {
        await request.query(`
          UPDATE tbl_Employee
          SET Reject = 0,
              Approval = 1
          WHERE EmployeeCode = @EmployeeCode
        `);
      }
   
      
      // 🌟 NEW: SKT Specific Logic for NewJoinSalaryApproval 🌟
      if (req.headers.subdbname === 'SKT' || req.headers.subdbname === 'LOCALHOST') {
           console.log(req.headers.subdbname, 43434);
        const sktReq = new sql.Request(transaction);
        
        // Passing required variables for your SQL script
        sktReq.input("EmployeeCode", sql.Int, payload.id);
        sktReq.input("CompanyCode", sql.Int, payload.companyCode); 
        sktReq.input("Approval", sql.Int, payload.reject === 1 ? 0 : 1);
        
        // Ensure payload.salary exists, otherwise default to 0 to prevent crashes
        sktReq.input("Salary", sql.Decimal(12, 2), payload.salary || 0); 

        await sktReq.query(`
          IF @Salary > 0
          BEGIN        
              IF @Approval = 1
              BEGIN
                  -- Declaring @NewJoin so the script runs properly in mssql
                  DECLARE @NewJoin INT; 
                  
                  SELECT @NewJoin = EmployeeCode 
                  FROM tbl_NewJoinSalaryApproval 
                  WHERE EmployeeCode = @EmployeeCode;
                  
                  IF ISNULL(@NewJoin,0) <= 0
                  BEGIN
                      INSERT INTO tbl_NewJoinSalaryApproval
                        (EmployeeCode, Approval, ApprovalDate, ApprovalUser, ApprovalNode, Reject, RejectDate, RejectUser, RejectNode, CompanyCode) 
                      VALUES
                        (@EmployeeCode, 0, NULL, NULL, NULL, 0, NULL, NULL, NULL, @CompanyCode);
                  END
              END
          END
        `);
      }

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, payload.id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "PAYROLL")
        .input("subModuleName", sql.NVarChar, "Employee Approval")
        .execute("web_sp_Notification_Update");

      // Dashboard Update
      const dashReq = new sql.Request(transaction);
      // applyBranchCode(dashReq, req.headers); // Optional depending on if dashboard logic needs branch
      await dashReq.query(`
        UPDATE A 
        SET A.HR_Employee_Approval_Pending = B.Nos 
        FROM tbl_DashBoard A, 
          (SELECT ISNULL(COUNT(EmployeeCode), 0) AS Nos  
           FROM tbl_Employee 
           WHERE Approval = 0 AND Reject = 0) B
        WHERE A.DashBoardCode = 1;
      `);

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message:
          payload.message ||
          (payload.reject
            ? "Rejected Successfully!"
            : "Approved Successfully!"),
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Employee approval process failed.",
      });
    }
  } catch (err) {
    console.error("Outer Error:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};


export const attendanceManualEntryApproval = async (req, res) => {
  const payload = req.body;

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

      // 🔹 Execute Stored Procedure
      const request = new sql.Request(transaction);
      // applyBranchCode(request, req.headers); // 👈 Fix applied
      // if (request.parameters && request.parameters.CompanyCode) {
      //   delete request.parameters.CompanyCode;
      // }
      request
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode)
        .input("ManualCode", sql.Int, payload.id);

      if (payload.reject === 1) {
        request.input("Reject", sql.Int, 1);
      } else {
        request.input("Approval", sql.Int, 1);
      }

      const result = await request.execute("sp_ManualEntryApproval_AddEdit");
      console.log(result, "result 234234");

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, payload.id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "PAYROLL")
        .input(
          "subModuleName",
          sql.NVarChar,
          "Attendance Manual Entry Approval",
        )
        .execute("web_sp_Notification_Update");

      // Dashboard Update
      const request2 = new sql.Request(transaction);
      // applyBranchCode(request2, req.headers); // 👈 Fix applied
      await request2.batch(`
            EXEC sp_ManualEntryApproval_Pendings
            UPDATE tbl_DashBoard 
            SET HR_AttenManualEntry_ApprovalPendings = @@ROWCOUNT
            WHERE CompanyCode = ${payload.companyCode}
      `);

      await transaction.commit();

      return res.status(200).json({
        success: true,
        data: result.recordset || [],
        message: payload.reject
          ? "Manual Entry Rejected Successfully!"
          : "Manual Entry Approved Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Attendance manual entry approval failed.",
      });
    }
  } catch (err) {
    console.error("Outer Error:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const employeeWiseIncrementApproval = async (req, res) => {
  const payload = req.body;
  let transaction; // 👈 important

  try {
    if (!req.headers.subdbname) {
      return res.status(400).json({
        success: false,
        message: "Missing subDBName",
      });
    }

    const pool = await getPool(req.headers.subdbname);
    const { nodeCode, userId } = req.headers;

    transaction = new sql.Transaction(pool);
    await transaction.begin(); // ✅ BEGIN FIRST

    // ============================
    // INCREMENT APPROVAL
    // ============================
    const request = new sql.Request(transaction);

    request
      .input("User", sql.Int, userId)
      .input("Node", sql.Int, nodeCode)
      .input("IncrementCode", sql.Int, payload.id)
      .input(payload.reject === 1 ? "Reject" : "Approval", sql.Int, 1);

    const result = await request.execute("sp_IncrementApproval_AddEdit");

    // ============================
    // NOTIFICATION UPDATE
    // ============================
    const notifyReq = new sql.Request(transaction);

    await notifyReq
      .input("ApprovalID", sql.Int, payload.id)
      .input("IsNotify", sql.Bit, 1)
      .input("IsRead", sql.Bit, 1)
      .input("IsApproved", sql.Bit, 1)
      .input("ModuleName", sql.NVarChar, "PAYROLL")
      .input("subModuleName", sql.NVarChar, "Employee Wise Increment Approval")
      .execute("web_sp_Notification_Update");

    await transaction.commit(); // ✅ COMMIT

    // ============================
    // DASHBOARD UPDATE (NO TX)
    // ============================
    const postRequest = new sql.Request(pool);

    // postRequest.input("CompanyCode", sql.Int, req.headers.companycode);

    applyBranchCode(postRequest, req.headers);

    await postRequest.batch(`
  EXEC sp_IncrementApproval_Pendings @CompanyCode = @CompanyCode
  UPDATE tbl_DashBoard
  SET HR_EmpWiseIncrement_ApprovalPendings = @@ROWCOUNT
`);

    return res.status(200).json({
      success: true,
      data: result.recordset || [],
      message: payload.reject
        ? "Manual Entry Rejected Successfully!"
        : "Manual Entry Approved Successfully!",
    });
  } catch (err) {
    // ✅ ROLLBACK ONLY IF STARTED
    if (transaction && transaction._aborted !== true) {
      try {
        await transaction.rollback();
      } catch (_) {}
    }

    console.error("Approval Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Employee increment approval failed",
    });
  }
};

export const gradeWIseIncrementApproval = async (req, res) => {
  const payload = req.body;
  console.log(payload, "2342342");

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { FYCode, nodeCode, userId, companyCode } = req.headers;
    console.log(
      nodeCode,
      userId,
      companyCode,
      req.headers,
      req.headers.subdbname,
      786633,
    );

    const transaction = new sql.Transaction(pool);

    // 1. Create a flag to track transaction state
    let isTransactionActive = false;
    let result;
    try {
      await transaction.begin();
      isTransactionActive = true; // Mark active

      // 🔹 Execute Stored Procedure
      const request = new sql.Request(transaction);

      // if (payload.reject === 1) {
      //   request.input("Reject", sql.Int, 1);
      // } else {
      //   request.input("Approval", sql.Int, 1);
      // }

      if (
        req.headers.subdbname === "SKT" 
        // ||
        // req.headers.subdbname === "LOCALHOST"
      ) {
        // 1. Check if payload is an array (multiple rows) or a single object
        const rows = Array.isArray(payload) ? payload : [payload];

        for (const row of rows) {
          // Create a new request for each iteration to reset parameters
          const request = new sql.Request(transaction);

          request
            .input("Approval", sql.Int, 1)
            .input("UserCode", sql.Int, userId)
            .input("NodeCode", sql.Int, nodeCode)
            .input("CompanyCode", sql.Int, companyCode)
            .input("EmployeeCode", sql.Int, row.EmployeeCode)
            .input(
              "CurrentGrade",
              sql.Int,
              row.CurrentGrade || row.IncrementGradeCode,
            )
            .input(
              "PerviousGrade",
              sql.Int,
              row.PerviousGrade || row.GradeCode,
            );

          // VB.NET code doesn't show EffectDate, but if your SP requires it:
          if (row.EffectDate) {
            request.input("EffectDate", sql.Date, row.EffectDate);
          }

          result = await request.execute("sp_Employee_Increment_Add_Auto");
        }

        // 2. CRITICAL: Commit the transaction after the loop finishes
        await transaction.commit();
        isTransactionActive = false;
      } else {
        request
          .input("User", sql.Int, userId)
          .input("Node", sql.Int, nodeCode)
          .input("IncrementCode", sql.Int, payload.id)
        .input("IsApproved", sql.Bit, 1)
        result = await request.execute("sp_IncrementApproval_AddEdit");

        // Notification Update
        const request3 = new sql.Request(transaction);

        await request3
          .input("ApprovalID", sql.Int, payload.id)
          .input("IsNotify", sql.Bit, 1)
          .input("IsRead", sql.Bit, 1)
          .input("IsApproved", sql.Bit, 1)
          .input("ModuleName", sql.NVarChar, "PAYROLL")
          .input("subModuleName", sql.NVarChar, "Grade Wise Increment Approval")
          .execute("web_sp_Notification_Update");

        await transaction.commit();
        isTransactionActive = false; // 2. Mark inactive immediately after commit

        // 3. Dashboard Update (Moved logic here)
        // Note: If this fails now, it will go to catch, but won't trigger rollback
        try {
          const postRequest = new sql.Request(pool);
          applyBranchCode(postRequest, req.headers);
          await postRequest.batch(`
          EXEC sp_IncrementApproval_1_Pendings
          UPDATE tbl_DashBoard
          SET HR_GradeWiseIncrement_ApprovalPendings = @@ROWCOUNT
        `);
        } catch (dashboardErr) {
          // Log dashboard error but don't fail the request since approval succeeded
          console.error("Dashboard update failed:", dashboardErr);
        }
      }
      console.log(result, "result, 5444");

      return res.status(200).json({
        success: true,
        data: result.recordset || [],
        message: payload.reject
          ? "Grade Wise Increment Rejected Successfully!"
          : "Grade Wise Approved Successfully!",
      });
    } catch (err) {
      // 4. Only rollback if the transaction is still active
      if (isTransactionActive) {
        await transaction.rollback();
      }

      console.error("Transaction Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Grade-wise increment approval failed.",
      });
    }
  } catch (err) {
    console.error("Outer Error:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const onDutyEntryApprovalApproval = async (req, res) => {
  const payload = req.body;
  console.log(payload, 433532);

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

      // Execute Stored Procedure
      const request = new sql.Request(transaction);

      request
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode)
        .input("OnDutyEntryCode", sql.Int, payload.id);

      if (payload.reject === 1) {
        request.input("Reject", sql.Int, 1);
      } else {
        request.input("Approval", sql.Int, 1);
      }

      const result = await request.execute("sp_OnDutyEntryApproval_AddEdit");

      // Notification Update
      const request3 = new sql.Request(transaction);

      await request3
        .input("ApprovalID", sql.Int, payload.id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "PAYROLL")
        .input("subModuleName", sql.NVarChar, "Onduty Approval")
        .execute("web_sp_Notification_Update");

      await transaction.commit();

      // Dashboard Update
      const postRequest = new sql.Request(pool);
      applyBranchCode(postRequest, req.headers); // 👈 Fix applied
      await postRequest.batch(`
        EXEC sp_OnDutyEntryApproval_Pendings
        UPDATE tbl_DashBoard
        SET HR_OnDuty_ApprovalPendings = @@ROWCOUNT
      `);
      console.log(result, "result 34324");

      return res.status(200).json({
        success: true,
        data: result.recordset || [],
        message: payload.reject
          ? "OnDuty Rejected Successfully!"
          : "OnDuty Approved Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "OnDuty approval failed.",
      });
    }
  } catch (err) {
    console.error("Outer Error:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const CompensationWorkEntryApproval = async (req, res) => {
  const payload = req.body;

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

      // Execute Stored Procedure
      const request = new sql.Request(transaction);

      request
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode)
        .input("CompensationWorkEntryCode", sql.Int, payload.id);

      if (payload.reject === 1) {
        request.input("Approval", sql.Int, 0);
        request.input("Reject", sql.Int, 1);
      } else {
        request.input("Reject", sql.Int, 0);
        request.input("Approval", sql.Int, 1);
      }

      const result = await request.execute(
        "sp_CompensationWorkEntryApproval_AddEdit",
      );

      // Notification Update
      const request3 = new sql.Request(transaction);

      await request3
        .input("ApprovalID", sql.Int, payload.id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "PAYROLL")
        .input("subModuleName", sql.NVarChar, "Compensation Approval")
        .execute("web_sp_Notification_Update");

      await transaction.commit();

      // Dashboard Update
      const postRequest = new sql.Request(pool);
      applyBranchCode(postRequest, req.headers); // 👈 Fix applied
      await postRequest.batch(`
        EXEC sp_CompensationWorkEntryApproval_Pendings
        UPDATE tbl_DashBoard
        SET HR_Compensation_ApprovalPendings = @@ROWCOUNT
      `);

      return res.status(200).json({
        success: true,
        data: result.recordset || [],
        message: payload.reject
          ? "Compensation Approval Rejected Successfully!"
          : "Compensation Approval Approved Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Compensation approval failed.",
      });
    }
  } catch (err) {
    console.error("Outer Error:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const leaveEntryApproval = async (req, res) => {
  const payload = req.body;

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

      // Execute Stored Procedure
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      request.input("LeaveEntryCode", sql.Int, payload.id);

      if (payload.reject === 1) {
        request.input("Approval", sql.Int, 0);
        request.input("Reject", sql.Int, 1);
      } else {
        request.input("Reject", sql.Int, 0);
        request.input("Approval", sql.Int, 1);
      }

      const result = await request.execute("sp_LeaveEntryApproval_AddEdit");

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, payload.id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "PAYROLL")
        .input("subModuleName", sql.NVarChar, "Leave Approval")
        .execute("web_sp_Notification_Update");

      await transaction.commit();

      // Dashboard Update
      const postRequest = new sql.Request(pool);
      applyBranchCode(postRequest, req.headers); // 👈 Fix applied
      await postRequest.batch(`
        EXEC sp_LeaveEntryApproval_Pendings
        UPDATE tbl_DashBoard
        SET HR_Leave_ApprovalPendings = @@ROWCOUNT
      `);

      return res.status(200).json({
        success: true,
        data: result.recordset || [],
        message: payload.reject
          ? "Leave Rejected Successfully!"
          : "Leave Approved Successfully!",
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Leave entry approval failed.",
      });
    }
  } catch (err) {
    console.error("Outer Error:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// Get List Functions

export const getEmployeeApproveOverview = async (req, res) => {
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

    const employeeCode = parseInt(paramId?.id);
    const companyCode = parseInt(paramData?.companyCode);

    // ---- Main Employee Info
    const request1 = pool.request();
    applyBranchCode(request1, req.headers); // 👈 Fix applied
    if (request1.parameters && request1.parameters.CompanyCode) {
      delete request1.parameters.CompanyCode;
    }
    let mainResult = await request1
      .input("EmployeeCode", sql.Int, employeeCode)
      .execute("web_sp_Employee_GetAll_Photo");

    const totalRecords = mainResult?.recordset?.length || 0;
    const employeeInfo = {
      ...mainResult.recordset?.[0],
      id: mainResult.recordset?.[0]?.EmployeeCode,
    };

    // ---- Photo Table
    const request2 = pool.request();
    applyBranchCode(request2, req.headers); // 👈 Fix applied
    let photoResult = await request2
      // .input("CompanyCode", sql.Int, companyCode)
      .input("EmployeeCode", sql.Int, employeeCode)
      .query(
        "SELECT Photo FROM tbl_Employee_Photo WHERE CompanyCode = @CompanyCode AND EmployeeCode = @EmployeeCode",
      );

    const employeePhoto = photoResult?.recordset?.[0]?.Photo || null;

    // ---- Experience Table
    const request3 = pool.request();
    applyBranchCode(request3, req.headers); // 👈 Fix applied
    let expResult = await request3
      // .input("CompanyCode", sql.Int, companyCode)
      .input("EmployeeCode", sql.Int, employeeCode)
      .execute("web_sp_EmployeeExp_GetAll");

    const employeeExperience = expResult?.recordset || [];

    // ---- Family Details Table
    const request4 = pool.request();
    applyBranchCode(request4, req.headers); // 👈 Fix applied
    if (request4.parameters && request4.parameters.CompanyCode) {
      delete request4.parameters.CompanyCode;
    }
    let familyResult = await request4
      .input("EmployeeCode", sql.Int, employeeCode)
      .execute("web_sp_EmployeeFamily_GetAll");

    const employeeFamily = familyResult?.recordset || [];

    // ---- Final Response
    res.status(200).json({
      totalRecords,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(totalRecords / pageSize),
      data: {
        ...employeeInfo,
        photo: employeePhoto,
        experience: employeeExperience,
        family: employeeFamily,
      },
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};
