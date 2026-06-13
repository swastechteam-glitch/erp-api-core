
// import sql from "mssql";
// import axios from "axios";
// import { getPool } from "../config/dynamicDB.js";

// // ============================================================================
// // UNIFIED PROCEDURE MAPPER
// // This guarantees both GET and EXPORT APIs use the exact same logic.
// // ============================================================================
// const applyReportParams = (request, paramData) => {
//   let procedureName = "";

//   // 1. New Joiners Report
//   if (paramData.parentHeader === "new-joiners-report") {
//     if (paramData.childHeader === "employee-wise") {
//       procedureName = "sp_Employee_NewJoining";
//       request.input("Emp_Status", sql.Bit, 1);
//     } else if (paramData.childHeader === "department-wise" || paramData.childHeader === "agent-wise") {
//       procedureName = "web_sp_Employee_NewJoining";
//     }
//   }
//   // 2. Employees Left Report
//   else if (paramData.parentHeader === "employees-left-report") {
//     if (paramData.childHeader === "employee-wise") {
//       procedureName = "sp_Employee_Left";
//       request.input("Emp_Status", sql.Bit, 1);
//     } else if (paramData.childHeader === "department-wise" || paramData.childHeader === "agent-wise") {
//       procedureName = "web_sp_Employee_Left";
//     }
//   }
//   // 3. Strength Report (Standard)
//   else if (paramData.parentHeader === "strength-report" && paramData.childHeader === "standard") {
//     procedureName = "web_sp_Strength";
//   }
//   // 4. Late In Report
//   else if (paramData.parentHeader === "late-in-report") {
//     procedureName = "sp_Employee_Attendance";
//     const attnVal = paramData?.attn ? parseInt(paramData.attn) : null;
//     const empStatusVal = (paramData?.empStatus === "true" || paramData?.empStatus === true) ? 1 : 0;
//     request.input("Attn", sql.Int, attnVal);
//     request.input("Emp_Status", sql.Bit, empStatusVal);
//   }
//   // 5. Attendance Reports
//   else if (paramData.parentHeader === "attendance-report") {
//     if (paramData.childHeader === "attendance-detail-reports") {
//       procedureName = "sp_Employee_Attendance";
//       request.input("Attn", sql.Int, 5);
//       request.input("Emp_Status", sql.Bit, (paramData?.empStatus === "true" || paramData?.empStatus === true) ? 1 : 0);
//     } else if (paramData.childHeader === "moments-report") {
//       procedureName = "sp_MovementDetails_GetAll";
//       request.input("Emp_Status", sql.Bit, (paramData?.empStatus === "true" || paramData?.empStatus === true) ? 1 : 0);
//       request.input("OrderBy", sql.Int, 0);
//     } else if (paramData.childHeader === "leave-details-report") {
//       procedureName = "sp_Employee_Attendance";
//       request.input("Attn", sql.Int, 11);
//       request.input("Emp_Status", sql.Bit, (paramData?.empStatus === "true" || paramData?.empStatus === true) ? 1 : 0);
//     }
//   }
//   // 6. Vacation Detailed Report
//   else if (paramData.parentHeader === "vacation-report" && paramData.childHeader === "detailed-report") {
//     procedureName = "sp_VacationEntry_GetAll";
//     const empStatusVal = (paramData?.empStatus === "false" || paramData?.empStatus === false) ? 0 : 1;
//     request.input("Emp_Status", sql.Bit, empStatusVal);
//     request.input("WithOutIN", sql.Int, 1);
//     request.input("WithIn", sql.Int, 1);
//   }
//   // 7. Costing Report (Grade With Designation)
//   else if (paramData.parentHeader === "costing-report" && paramData.childHeader === "grade-with-designation") {
//     procedureName = "sp_strength";
//     request.input("Emp_Status", sql.Bit, 1);
//     request.input("CostingReport", sql.Int, 1);
//   }

//   return procedureName;
// };


// // ============================================================================
// // GET HRM REPORTS API
// // ============================================================================
// export const getHRMReports = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const subDbName = req.headers.subdbname;

//     if (!subDbName) {
//       return res.status(400).json({ success: false, message: "Missing subDBName" });
//     }

//     const pool = await getPool(subDbName);

//     // ------------------------------------------------------------------------
//     // SPECIAL CASE: GRADE WISE STRENGTH REPORT
//     // ------------------------------------------------------------------------
//     if (paramData.parentHeader === "strength-report" && paramData.childHeader === "grade-wise") {
//       const sktCompanyCode = paramData?.companyCode ? parseInt(paramData.companyCode) : 1;
      
//       const sktStrengthReq = pool.request();
//       sktStrengthReq.input("FromDate", sql.DateTime, paramData?.fromDate ? new Date(paramData.fromDate) : null);
//       sktStrengthReq.input("ToDate", sql.DateTime, paramData?.toDate ? new Date(paramData.toDate) : null);
//       sktStrengthReq.input("CompanyCode", sql.Int, sktCompanyCode);

//       const strengthResult = await sktStrengthReq.execute("sp_GradeWise_Strength");

//       const sktCompanyReq = pool.request();
//       sktCompanyReq.input("CompanyCode", sql.Int, sktCompanyCode);

//       const companyResult = await sktCompanyReq.execute("sp_Company_GetAll");

//       return res.status(200).json({
//         success: true,
//         gradeWiseStrength: strengthResult.recordset || [],
//         companyData: companyResult.recordset || [],
//       });
//     }

//     // ------------------------------------------------------------------------
//     // STANDARD REPORTS LOGIC
//     // ------------------------------------------------------------------------
//     const request = pool.request();
//     const bCode = req.headers["branchCode"] || req.headers["branchcode"];
    
//     if (bCode) {
//       request.input("BranchCode", sql.Int, parseInt(bCode));
//     }

//     const toDateObj = paramData?.toDate ? new Date(paramData.toDate) : null;
//     const fromDateObj = paramData?.fromDate ? new Date(paramData.fromDate) : null;
    
//     // Safely parse companyCode so it never passes NaN to SQL Server
//     const companyCodeParsed = paramData?.companyCode ? parseInt(paramData.companyCode) : 1;

//     request
//       .input("ToDate", sql.DateTime, toDateObj)
//       .input("CompanyCode", sql.Int, companyCodeParsed);

//     if (paramData.parentHeader === "strength-report" || paramData.parentHeader === "costing-report") {
//       request.input("STDate", sql.DateTime, fromDateObj);
//     } else {
//       request.input("FromDate", sql.DateTime, fromDateObj);
//     }

//     // Use unified mapper to get the procedure
//     const procedureName = applyReportParams(request, paramData);

//     if (!procedureName) {
//       return res.status(400).json({ 
//         error: "Invalid report parameters", 
//         details: `No procedure mapped for parentHeader: '${paramData.parentHeader}', childHeader: '${paramData.childHeader}'` 
//       });
//     }

//     const result = await request.execute(procedureName);
//     let data = result.recordset || [];

//     // ------------------------------------------------------------------------
//     // DATA GROUPING & FORMATTING
//     // ------------------------------------------------------------------------

//     // Grouping for New Joiners / Employees Left (EXCEPT employee-wise)
//     if (
//       (paramData.parentHeader === "new-joiners-report" || paramData.parentHeader === "employees-left-report") && 
//       paramData.childHeader !== "employee-wise"
//     ) {
//       const grouped = {};
//       const isDept = paramData.childHeader === "department-wise";
//       data.forEach((row) => {
//         const key = isDept ? (row.DepartmentCode || 0) : (row.AgentCode || 0);
//         if (!grouped[key]) {
//           grouped[key] = isDept 
//             ? { DepartmentCode: row.DepartmentCode, DepartmentName: row.DepartmentName, EmployeeCount: 0 }
//             : { AgentCode: row.AgentCode, AgentName: row.AgentName, EmployeeCount: 0 };
//         }
//         grouped[key].EmployeeCount += 1;
//       });
//       data = Object.values(grouped);
//     }

//     // Grouping for Standard Strength Report
//     if (paramData.parentHeader === "strength-report" && paramData.childHeader === "standard") {
//       const grouped = {};
//       data.forEach((row) => {
//         const key = row.DepartmentCode || 0;
//         if (!grouped[key]) {
//           grouped[key] = {
//             DepartmentCode: row.DepartmentCode, DepartmentName: row.DepartmentName,
//             GeneralShift: 0, GeneralShift_OT: 0, IShift: 0, IShift_OT: 0,
//             IIShift: 0, IIShift_OT: 0, IIIShift: 0, IIIShift_OT: 0,
//             AvgManPower: 0, PresentShift: 0, PresentShift_OT: 0, TotalPresent: 0, Leave: 0, TotalPersons: 0, DayShift: 0, NightShift: 0,
//           };
//         }
//         grouped[key].GeneralShift += row.GeneralShift || 0;
//         grouped[key].GeneralShift_OT += row.GeneralShift_OT || 0;
//         grouped[key].IShift += row.IShift || 0;
//         grouped[key].IShift_OT += row.IShift_OT || 0;
//         grouped[key].IIShift += row.IIShift || 0;
//         grouped[key].IIShift_OT += row.IIShift_OT || 0;
//         grouped[key].IIIShift += row.IIIShift || 0;
//         grouped[key].IIIShift_OT += row.IIIShift_OT || 0;
//         grouped[key].AvgManPower += row.AvgManPower || 0;
//         grouped[key].Leave += row.Leave || 0;
//         grouped[key].DayShift += row.DayShift || 0;
//         grouped[key].NightShift += row.NightShift || 0;
//       });

//       Object.values(grouped).forEach((g) => {
//         g.PresentShift = g.GeneralShift + g.IShift + g.IIShift + g.IIIShift + g.DayShift + g.NightShift;
//         g.PresentShift_OT = g.GeneralShift_OT + g.IShift_OT + g.IIShift_OT + g.IIIShift_OT;
//         g.TotalPresent = g.PresentShift + g.PresentShift_OT / 8;
//         g.TotalPersons = g.PresentShift + g.Leave;
//       });

//       Object.values(grouped).forEach((g) => {
//         g.GeneralShift = g.GeneralShift && g.GeneralShift != 0 ? g.GeneralShift.toFixed(1) : "-";
//         g.GeneralShift_OT = g.GeneralShift_OT && g.GeneralShift_OT != 0 ? g.GeneralShift_OT.toFixed(2) : "-";
//         g.IShift = g.IShift && g.IShift != 0 ? g.IShift.toFixed(1) : "-";
//         g.IShift_OT = g.IShift_OT && g.IShift_OT != 0 ? g.IShift_OT.toFixed(2) : "-";
//         g.IIShift = g.IIShift && g.IIShift != 0 ? g.IIShift.toFixed(1) : "-";
//         g.IIShift_OT = g.IIShift_OT && g.IIShift_OT != 0 ? g.IIShift_OT.toFixed(2) : "-";
//         g.IIIShift = g.IIIShift && g.IIIShift != 0 ? g.IIIShift.toFixed(1) : "-";
//         g.IIIShift_OT = g.IIIShift_OT && g.IIIShift_OT != 0 ? g.IIIShift_OT.toFixed(1) : "-";
//         g.AvgManPower = g.AvgManPower && g.AvgManPower != 0 ? g.AvgManPower.toFixed(1) : "-";
//         g.PresentShift = g.PresentShift && g.PresentShift != 0 ? g.PresentShift.toFixed(1) : "-";
//         g.PresentShift_OT = g.PresentShift_OT && g.PresentShift_OT != 0 ? g.PresentShift_OT.toFixed(2) : "-";
//         g.TotalPresent = g.TotalPresent && g.TotalPresent != 0 ? g.TotalPresent.toFixed(3) : "-";
//         g.Leave = g.Leave && g.Leave != 0 ? g.Leave.toFixed(2) : "-";
//         g.TotalPersons = g.TotalPersons && g.TotalPersons != 0 ? g.TotalPersons.toFixed(0) : "-";
//       });

//       data = Object.values(grouped);
//     }

//     res.status(200).json({ success: true, totalRecords: data.length, data: data });
//   } catch (err) {
//     console.log("SQL Execution Error in getHRMReports:", err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// };

// // ============================================================================
// // EXPORT HRM REPORTS API
// // ============================================================================
// export const exportHRMReports = async (req, res) => {
//   try {
//     const paramData = req.query; 
//     const subDbName = req.headers.subdbname;

//     if (!subDbName) {
//       return res.status(400).json({ success: false, message: "Missing subDBName header" });
//     }

//     const pool = await getPool(subDbName);
//     const request = pool.request();
    
//     const bCode = req.headers["branchCode"] || req.headers["branchcode"];
//     if (bCode) {
//       request.input("BranchCode", sql.Int, parseInt(bCode));
//     }

//     const fromDateObj = paramData?.fromDate ? new Date(paramData.fromDate) : null;
//     const toDateObj = paramData?.toDate ? new Date(paramData.toDate) : null;
    
//     // Safely parse companyCode so it never passes NaN
//     const companyCodeParsed = paramData?.companyCode ? parseInt(paramData.companyCode) : 1;

//     request.input("ToDate", sql.DateTime, toDateObj);
//     request.input("CompanyCode", sql.Int, companyCodeParsed);

//     if (paramData.parentHeader === "strength-report" || paramData.parentHeader === "costing-report") {
//       request.input("STDate", sql.DateTime, fromDateObj);
//     } else {
//       request.input("FromDate", sql.DateTime, fromDateObj);
//     }

//     // Use unified mapper to get the procedure exactly like the GET route
//     const procedureName = applyReportParams(request, paramData);

//     if (!procedureName) {
//       return res.status(400).json({ 
//         success: false, 
//         message: "Export not supported for this report yet.",
//         details: `No procedure mapped for parentHeader: '${paramData.parentHeader}', childHeader: '${paramData.childHeader}'`
//       });
//     }

//     const result = await request.execute(procedureName);
//     const data = result.recordset || [];

//     return res.status(200).json({ 
//       success: true, 
//       totalRecords: data.length, 
//       data: data 
//     });

//   } catch (err) {
//     console.error("SQL Execution Error in exportHRMReports:", err);
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };



import sql from "mssql";
import axios from "axios";
import { getPool } from "../config/dynamicDB.js";

// ============================================================================
// UNIFIED PROCEDURE MAPPER
// This guarantees both GET and EXPORT APIs use the exact same logic.
// ============================================================================
const applyReportParams = (request, paramData) => {
  let procedureName = "";

  // 1. New Joiners Report
  if (paramData.parentHeader === "new-joiners-report") {
    if (paramData.childHeader === "employee-wise") {
      procedureName = "sp_Employee_NewJoining";
      request.input("Emp_Status", sql.Bit, 1);
    } else if (paramData.childHeader === "department-wise" || paramData.childHeader === "agent-wise") {
      procedureName = "web_sp_Employee_NewJoining";
    }
  }
  // 2. Employees Left Report
  else if (paramData.parentHeader === "employees-left-report") {
    if (paramData.childHeader === "employee-wise") {
      procedureName = "sp_Employee_Left";
      request.input("Emp_Status", sql.Bit, 1);
    } else if (paramData.childHeader === "department-wise" || paramData.childHeader === "agent-wise") {
      procedureName = "web_sp_Employee_Left";
    }
  }
  // 3. Strength Report (Standard)
  else if (paramData.parentHeader === "strength-report" && paramData.childHeader === "standard") {
    procedureName = "web_sp_Strength";
  }
  // 4. Late In Report
  else if (paramData.parentHeader === "late-in-report") {
    procedureName = "sp_Employee_Attendance";
    const attnVal = paramData?.attn ? parseInt(paramData.attn) : null;
    const empStatusVal = (paramData?.empStatus === "true" || paramData?.empStatus === true) ? 1 : 0;
    request.input("Attn", sql.Int, attnVal);
    request.input("Emp_Status", sql.Bit, empStatusVal);
  }
  // 5. Attendance Reports
  else if (paramData.parentHeader === "attendance-report") {
    if (paramData.childHeader === "attendance-detail-reports") {
      procedureName = "sp_Employee_Attendance";
      request.input("Attn", sql.Int, 5);
      request.input("Emp_Status", sql.Bit, (paramData?.empStatus === "true" || paramData?.empStatus === true) ? 1 : 0);
    } else if (paramData.childHeader === "moments-report") {
      procedureName = "sp_MovementDetails_GetAll";
      request.input("Emp_Status", sql.Bit, (paramData?.empStatus === "true" || paramData?.empStatus === true) ? 1 : 0);
      request.input("OrderBy", sql.Int, 0);
    } else if (paramData.childHeader === "leave-details-report") {
      procedureName = "sp_Employee_Attendance";
      request.input("Attn", sql.Int, 11);
      request.input("Emp_Status", sql.Bit, (paramData?.empStatus === "true" || paramData?.empStatus === true) ? 1 : 0);
    }
  }
  // 6. Vacation Detailed Report
  else if (paramData.parentHeader === "vacation-report" && paramData.childHeader === "detailed-report") {
    procedureName = "sp_VacationEntry_GetAll";
    const empStatusVal = (paramData?.empStatus === "false" || paramData?.empStatus === false) ? 0 : 1;
    request.input("Emp_Status", sql.Bit, empStatusVal);
    request.input("WithOutIN", sql.Int, 1);
    request.input("WithIn", sql.Int, 1);
  }
  // 7. Costing Report (Grade With Designation)
  else if (paramData.parentHeader === "costing-report" && paramData.childHeader === "grade-with-designation") {
    procedureName = "sp_strength";
    request.input("Emp_Status", sql.Bit, 1);
    request.input("CostingReport", sql.Int, 1);
  }
  // 8. Increment Report 
  else if (paramData.parentHeader === "increment-report") {
    // Both Grade Approval and Wages Revision share the same procedure
    if (paramData.childHeader === "grade-approval" || paramData.childHeader === "wages-revision") {
      procedureName = "sp_Employee_Increment";
      const empStatusVal = (paramData?.empStatus === "false" || paramData?.empStatus === false) ? 0 : 1;
      request.input("Emp_Status", sql.Bit, empStatusVal);
    } 
    // New Join Salary Approval uses its specific procedure
    else if (paramData.childHeader === "new-join-salary") {
      procedureName = "sp_NewJoinApproval_GetAll";
      request.input("Approval", sql.Bit, (paramData.approval === 'true' || paramData.approval == 1) ? 1 : 0);
      request.input("Reject", sql.Bit, (paramData.reject === 'true' || paramData.reject == 1) ? 1 : 0);
    }
  }
  // 9. Designation Change Report (NEW)
  else if (paramData.parentHeader === "designation-report" && paramData.childHeader === "designation-change") {
    procedureName = "sp_DesignationChange_GetAll";
    // Note: @FromDate, @ToDate, and @CompanyCode are injected globally below automatically.
  }

  return procedureName;
};


// ============================================================================
// GET HRM REPORTS API
// ============================================================================
export const getHRMReports = async (req, res) => {
  try {
    const paramData = req.query;
    const subDbName = req.headers.subdbname;

    if (!subDbName) {
      return res.status(400).json({ success: false, message: "Missing subDBName" });
    }

    const pool = await getPool(subDbName);

    // ------------------------------------------------------------------------
    // SPECIAL CASE: GRADE WISE STRENGTH REPORT
    // ------------------------------------------------------------------------
    if (paramData.parentHeader === "strength-report" && paramData.childHeader === "grade-wise") {
      const sktCompanyCode = paramData?.companyCode ? parseInt(paramData.companyCode) : 1;
      
      const sktStrengthReq = pool.request();
      sktStrengthReq.input("FromDate", sql.DateTime, paramData?.fromDate ? new Date(paramData.fromDate) : null);
      sktStrengthReq.input("ToDate", sql.DateTime, paramData?.toDate ? new Date(paramData.toDate) : null);
      sktStrengthReq.input("CompanyCode", sql.Int, sktCompanyCode);

      const strengthResult = await sktStrengthReq.execute("sp_GradeWise_Strength");

      const sktCompanyReq = pool.request();
      sktCompanyReq.input("CompanyCode", sql.Int, sktCompanyCode);

      const companyResult = await sktCompanyReq.execute("sp_Company_GetAll");

      return res.status(200).json({
        success: true,
        gradeWiseStrength: strengthResult.recordset || [],
        companyData: companyResult.recordset || [],
      });
    }

    // ------------------------------------------------------------------------
    // STANDARD REPORTS LOGIC
    // ------------------------------------------------------------------------
    const request = pool.request();
    const bCode = req.headers["branchCode"] || req.headers["branchcode"];
    
    if (bCode) {
      request.input("BranchCode", sql.Int, parseInt(bCode));
    }

    const toDateObj = paramData?.toDate ? new Date(paramData.toDate) : null;
    const fromDateObj = paramData?.fromDate ? new Date(paramData.fromDate) : null;
    
    // Safely parse companyCode so it never passes NaN to SQL Server
    const companyCodeParsed = paramData?.companyCode ? parseInt(paramData.companyCode) : 1;

    // These parameters are added globally to every report
    request
      .input("ToDate", sql.DateTime, toDateObj)
      .input("CompanyCode", sql.Int, companyCodeParsed);

    if (paramData.parentHeader === "strength-report" || paramData.parentHeader === "costing-report") {
      request.input("STDate", sql.DateTime, fromDateObj);
    } else {
      // @FromDate added globally
      request.input("FromDate", sql.DateTime, fromDateObj);
    }

    // Use unified mapper to get the procedure
    const procedureName = applyReportParams(request, paramData);

    if (!procedureName) {
      return res.status(400).json({ 
        error: "Invalid report parameters", 
        details: `No procedure mapped for parentHeader: '${paramData.parentHeader}', childHeader: '${paramData.childHeader}'` 
      });
    }

    const result = await request.execute(procedureName);
    let data = result.recordset || [];

    // ------------------------------------------------------------------------
    // DATA GROUPING & FORMATTING
    // ------------------------------------------------------------------------

    // Grouping for New Joiners / Employees Left (EXCEPT employee-wise)
    if (
      (paramData.parentHeader === "new-joiners-report" || paramData.parentHeader === "employees-left-report") && 
      paramData.childHeader !== "employee-wise"
    ) {
      const grouped = {};
      const isDept = paramData.childHeader === "department-wise";
      data.forEach((row) => {
        const key = isDept ? (row.DepartmentCode || 0) : (row.AgentCode || 0);
        if (!grouped[key]) {
          grouped[key] = isDept 
            ? { DepartmentCode: row.DepartmentCode, DepartmentName: row.DepartmentName, EmployeeCount: 0 }
            : { AgentCode: row.AgentCode, AgentName: row.AgentName, EmployeeCount: 0 };
        }
        grouped[key].EmployeeCount += 1;
      });
      data = Object.values(grouped);
    }

    // Grouping for Standard Strength Report
    if (paramData.parentHeader === "strength-report" && paramData.childHeader === "standard") {
      const grouped = {};
      data.forEach((row) => {
        const key = row.DepartmentCode || 0;
        if (!grouped[key]) {
          grouped[key] = {
            DepartmentCode: row.DepartmentCode, DepartmentName: row.DepartmentName,
            GeneralShift: 0, GeneralShift_OT: 0, IShift: 0, IShift_OT: 0,
            IIShift: 0, IIShift_OT: 0, IIIShift: 0, IIIShift_OT: 0,
            AvgManPower: 0, PresentShift: 0, PresentShift_OT: 0, TotalPresent: 0, Leave: 0, TotalPersons: 0, DayShift: 0, NightShift: 0,
          };
        }
        grouped[key].GeneralShift += row.GeneralShift || 0;
        grouped[key].GeneralShift_OT += row.GeneralShift_OT || 0;
        grouped[key].IShift += row.IShift || 0;
        grouped[key].IShift_OT += row.IShift_OT || 0;
        grouped[key].IIShift += row.IIShift || 0;
        grouped[key].IIShift_OT += row.IIShift_OT || 0;
        grouped[key].IIIShift += row.IIIShift || 0;
        grouped[key].IIIShift_OT += row.IIIShift_OT || 0;
        grouped[key].AvgManPower += row.AvgManPower || 0;
        grouped[key].Leave += row.Leave || 0;
        grouped[key].DayShift += row.DayShift || 0;
        grouped[key].NightShift += row.NightShift || 0;
      });

      Object.values(grouped).forEach((g) => {
        g.PresentShift = g.GeneralShift + g.IShift + g.IIShift + g.IIIShift + g.DayShift + g.NightShift;
        g.PresentShift_OT = g.GeneralShift_OT + g.IShift_OT + g.IIShift_OT + g.IIIShift_OT;
        g.TotalPresent = g.PresentShift + g.PresentShift_OT / 8;
        g.TotalPersons = g.PresentShift + g.Leave;
      });

      Object.values(grouped).forEach((g) => {
        g.GeneralShift = g.GeneralShift && g.GeneralShift != 0 ? g.GeneralShift.toFixed(1) : "-";
        g.GeneralShift_OT = g.GeneralShift_OT && g.GeneralShift_OT != 0 ? g.GeneralShift_OT.toFixed(2) : "-";
        g.IShift = g.IShift && g.IShift != 0 ? g.IShift.toFixed(1) : "-";
        g.IShift_OT = g.IShift_OT && g.IShift_OT != 0 ? g.IShift_OT.toFixed(2) : "-";
        g.IIShift = g.IIShift && g.IIShift != 0 ? g.IIShift.toFixed(1) : "-";
        g.IIShift_OT = g.IIShift_OT && g.IIShift_OT != 0 ? g.IIShift_OT.toFixed(2) : "-";
        g.IIIShift = g.IIIShift && g.IIIShift != 0 ? g.IIIShift.toFixed(1) : "-";
        g.IIIShift_OT = g.IIIShift_OT && g.IIIShift_OT != 0 ? g.IIIShift_OT.toFixed(1) : "-";
        g.AvgManPower = g.AvgManPower && g.AvgManPower != 0 ? g.AvgManPower.toFixed(1) : "-";
        g.PresentShift = g.PresentShift && g.PresentShift != 0 ? g.PresentShift.toFixed(1) : "-";
        g.PresentShift_OT = g.PresentShift_OT && g.PresentShift_OT != 0 ? g.PresentShift_OT.toFixed(2) : "-";
        g.TotalPresent = g.TotalPresent && g.TotalPresent != 0 ? g.TotalPresent.toFixed(3) : "-";
        g.Leave = g.Leave && g.Leave != 0 ? g.Leave.toFixed(2) : "-";
        g.TotalPersons = g.TotalPersons && g.TotalPersons != 0 ? g.TotalPersons.toFixed(0) : "-";
      });

      data = Object.values(grouped);
    }

    res.status(200).json({ success: true, totalRecords: data.length, data: data });
  } catch (err) {
    console.log("SQL Execution Error in getHRMReports:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================================
// EXPORT HRM REPORTS API
// ============================================================================
export const exportHRMReports = async (req, res) => {
  try {
    const paramData = req.query; 
    const subDbName = req.headers.subdbname;

    if (!subDbName) {
      return res.status(400).json({ success: false, message: "Missing subDBName header" });
    }

    const pool = await getPool(subDbName);
    const request = pool.request();
    
    const bCode = req.headers["branchCode"] || req.headers["branchcode"];
    if (bCode) {
      request.input("BranchCode", sql.Int, parseInt(bCode));
    }

    const fromDateObj = paramData?.fromDate ? new Date(paramData.fromDate) : null;
    const toDateObj = paramData?.toDate ? new Date(paramData.toDate) : null;
    
    // Safely parse companyCode so it never passes NaN
    const companyCodeParsed = paramData?.companyCode ? parseInt(paramData.companyCode) : 1;

    request.input("ToDate", sql.DateTime, toDateObj);
    request.input("CompanyCode", sql.Int, companyCodeParsed);

    if (paramData.parentHeader === "strength-report" || paramData.parentHeader === "costing-report") {
      request.input("STDate", sql.DateTime, fromDateObj);
    } else {
      request.input("FromDate", sql.DateTime, fromDateObj);
    }

    // Use unified mapper to get the procedure exactly like the GET route
    const procedureName = applyReportParams(request, paramData);

    if (!procedureName) {
      return res.status(400).json({ 
        success: false, 
        message: "Export not supported for this report yet.",
        details: `No procedure mapped for parentHeader: '${paramData.parentHeader}', childHeader: '${paramData.childHeader}'`
      });
    }

    const result = await request.execute(procedureName);
    const data = result.recordset || [];

    return res.status(200).json({ 
      success: true, 
      totalRecords: data.length, 
      data: data 
    });

  } catch (err) {
    console.error("SQL Execution Error in exportHRMReports:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};



export const getReportFilters = async (req, res) => {
  try {
    // 1. Validate Database Header
    if (!req.headers.subdbname) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing subDBName" 
      });
    }

    // 2. Initialize Database Connection
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Optional: If you need to filter these lists by CompanyCode, uncomment below
    // const companyCode = req.query.CompanyCode;
    // request.input("CompanyCode", companyCode);
    // And add "WHERE CompanyCode = @CompanyCode" to the queries below.

    // 3. Write the Batch SQL Query
    // NOTE: It is highly recommended to replace "*" with specific columns (e.g., Id, Name) 
    // to keep the API response lightweight for the frontend.
    const query = `
      SELECT DepartmentCode, DepartmentName FROM tbl_Department;
      SELECT EmployeeBatchCode, EmployeeBatchName FROM tbl_EmployeeBatch;
      SELECT EmpCategoryCode, EmpCategoryName FROM tbl_empcategory;
      SELECT DesignationCode, DesignationName FROM tbl_Designation;
      SELECT EmployeeCode, EmployeeName FROM tbl_Employee;
    `;

    // 4. Execute the Query
    const result = await request.query(query);

    // 5. Map recordsets to a clean JSON object for the frontend
    // result.recordsets[0] corresponds to the first SELECT, [1] to the second, etc.
    const filterData = {
      departments: result.recordsets[0] || [],
      employeeBatches: result.recordsets[1] || [],
      categories: result.recordsets[2] || [],
      designations: result.recordsets[3] || [],
      employees: result.recordsets[4] || []
    };

    // 6. Send the Response
    res.status(200).json({
      success: true,
      data: filterData
    });

  } catch (err) {
    console.error("DB Error in getReportFilters:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};



// ============================================================================
// .NET PDF GENERATION API
// ============================================================================
export const getAttendanceMoment = async (req, res) => {
  try {
    const { reportName } = req.query;
    if (!reportName) return res.status(400).json({ success: false, message: "reportName is required" });

    // 1. Gather your SQL Data
    const pool = await getPool(req.headers.subdbname);
    const reportDataSources = {};
    // ... your while loop to execute SPs and fill reportDataSources ...

    // 2. Send Data to your .NET Microservice
    const dotNetApiUrl = 'http://localhost:5000/api/report/render';
    
    const pdfResponse = await axios.post(dotNetApiUrl, {
        ReportName: reportName,
        DataSources: reportDataSources
    }, {
        responseType: 'arraybuffer' 
    });

    // 3. Stream the PDF bytes directly to React
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${reportName}.pdf"`);
    
    return res.send(pdfResponse.data);

  } catch (err) {
    console.error("Report Generation Error:", err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
};