import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { applyBranchCode, showBranchDropDown } from "../utils/common.js";

export const getDepartmentAndShiftData = async (req, res) => {
  try {
    // 1. Validate Database connection header
    if (!req.headers.subdbname) {
      return res.status(400).json({ success: false, message: "Missing subDBName header" });
    }

    // 2. Connect to the database
    const pool = await getPool(req.headers.subdbname);

    // 3. Fetch Departments (NO FILTER APPLIED HERE)
    const deptRequest = pool.request();
    const deptQuery = `SELECT DepartmentCode,DepartmentName FROM tbl_Department`;
    const deptResult = await deptRequest.query(deptQuery);
    const subdbname = showBranchDropDown(req.headers.subdbname);
    // 4. Figure out which SQL filter to apply for the Shift table
    const bCode = req.headers["branchCode"] || req.headers["branchcode"];
    const isBranchCodeUsed = bCode && subdbname;
    
    // If KPF and bCode exist, we filter by BranchCode. Otherwise, we filter by CompanyCode.
    const filterSql = isBranchCodeUsed 
      ? " AND BranchCode = @BranchCode" 
      : " AND CompanyCode = @CompanyCode";

    // 5. Fetch Shifts (FILTER APPLIED HERE)
    const shiftRequest = pool.request();
    applyBranchCode(shiftRequest, req.headers); // This safely binds @BranchCode or @CompanyCode
    
    const shiftQuery = `SELECT ShiftCode,ShiftName FROM tbl_Shift WHERE 1=1` + filterSql;
    const shiftResult = await shiftRequest.query(shiftQuery);

    // 6. Send Response
    res.status(200).json({
      success: true,
      data: {
        departments: deptResult.recordset,
        shifts: shiftResult.recordset,
      },
    });

  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};


// export const getEmployeeAllotmentDetails = async (req, res) => {
//   try {
//     // 1. Extract parameters from the request query (e.g., ?FromDate=...&ToDate=...)
//     const { FromDate, ToDate, DepartmentCode, ShiftCode } = req.query;
    
//     // Extract CompanyCode from the headers (matching your previous setup)
//     const companyCode = req.headers["companyCode"] || req.headers["companycode"];

//     // 2. Validate Database connection header
//     if (!req.headers.subdbname) {
//       return res.status(400).json({ success: false, message: "Missing subDBName header" });
//     }

//     // 3. Connect to the database
//     const pool = await getPool(req.headers.subdbname);
//     const request = pool.request();

//     // 4. Bind the parameters for the Stored Procedure
//     // Note: If any parameter is strictly required by your SP, you can add validation checks here.
//     if (FromDate) request.input("FromDate", sql.Date, FromDate);
//     if (ToDate) request.input("ToDate", sql.Date, ToDate);
    
//     // Assuming DepartmentCode and ShiftCode are integers. If they are strings/varchars, 
//     // change sql.Int to sql.VarChar
//     if (DepartmentCode) request.input("DepartmentCode", sql.Int, parseInt(DepartmentCode));
//     if (ShiftCode) request.input("ShiftCode", sql.Int, parseInt(ShiftCode));
    
//     if (companyCode) request.input("CompanyCode", sql.Int, parseInt(companyCode));

//     // 5. Execute the Stored Procedure
//     const result = await request.execute("sp_EmployeeAllotmentDetails_GetAll");
//     console.log(result, 'result23423');
    
//     // 6. Send Response
//     res.status(200).json({
//       success: true,
//       data: result.recordset, 
//     });

//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// };


export const getEmployeeAllotmentDetails = async (req, res) => {
  try {
    const { FromDate, ToDate, DepartmentCode, ShiftCode } = req.query;
    const companyCode = req.headers["companyCode"];
    
    if (!req.headers.subdbname) {
      return res.status(400).json({ success: false, message: "Missing subDBName header" });
    }

    const pool = await getPool(req.headers.subdbname);

    // ==========================================
    // 1. Fetch ALL Machines for the Department
    // ==========================================
    const machineRequest = pool.request();
    if (DepartmentCode) {
      machineRequest.input("DepartmentCode", sql.Int, parseInt(DepartmentCode));
    }
    const machineResult = await machineRequest.execute("sp_EmpAllotment_GetbyMachine");
    const allMachines = machineResult.recordset;


    // ==========================================
    // 2. Fetch Allocated Employees
    // ==========================================
    const allocRequest = pool.request();
    if (FromDate) allocRequest.input("FromDate", sql.Date, FromDate);
    if (ToDate) allocRequest.input("ToDate", sql.Date, ToDate);
    if (DepartmentCode) allocRequest.input("DepartmentCode", sql.Int, parseInt(DepartmentCode));
    if (ShiftCode) allocRequest.input("ShiftCode", sql.Int, parseInt(ShiftCode));
    if (companyCode) allocRequest.input("CompanyCode", sql.Int, parseInt(companyCode));

    const allocResult = await allocRequest.execute("sp_EmployeeAllotmentDetails_GetAll");
    const allocations = allocResult.recordset;


    // ==========================================
    // 3. Merge Data (Left Join logic in JS)
    // ==========================================
    const mergedData = [];

    allMachines.forEach((machine) => {
      // Find all employees assigned to this specific machine and side.
      // Using (|| "") protects against null values in your SideName column (like CONVEYOR).
      const assignedEmployees = allocations.filter((alloc) => 
        alloc.MachineCode === machine.MachineCode && 
        (alloc.SideName || "") === (machine.SideName || "")
      );

      if (assignedEmployees.length > 0) {
        // If employees are assigned, push a row for EACH employee
        assignedEmployees.forEach((emp) => {
          mergedData.push({
            ...machine, // Base machine details
            ...emp,     // Employee allocation details (this overrides matching machine keys)
          });
        });
      } else {
        // If NO employee is assigned, push the machine with null employee fields
        mergedData.push({
          ...machine,
          EmployeeCode: null,
          EmployeeID: null,
          EmployeeName: null,
          DesignationName: null,
        });
      }
    });

    // ==========================================
    // 4. Send Response
    // ==========================================
    res.status(200).json({
      success: true,
      data: mergedData, 
    });

  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getUniqueEmployeeAllotments = async (req, res) => {
  try {
    const { FromDate, ToDate, DepartmentCode, ShiftCode } = req.query;
    const companyCode = req.headers["companyCode"] || req.headers["companycode"];

    // 1. Validate Database connection header
    if (!req.headers.subdbname) {
      return res.status(400).json({ success: false, message: "Missing subDBName header" });
    }

    // 2. Connect to the database
    const pool = await getPool(req.headers.subdbname);

    // ==========================================
    // 3. Fetch Query 1: Allotted Employees
    // ==========================================
    const allotReq = pool.request();
    if (FromDate) allotReq.input("FromDate", sql.Date, FromDate);
    if (ToDate) allotReq.input("ToDate", sql.Date, ToDate);
    if (DepartmentCode) allotReq.input("DepartmentCode", sql.Int, parseInt(DepartmentCode));
    if (ShiftCode) allotReq.input("ShiftCode", sql.Int, parseInt(ShiftCode));
    if (companyCode) allotReq.input("CompanyCode", sql.Int, parseInt(companyCode));

    const allotResult = await allotReq.execute("sp_EmployeeAllotmentDetails_GetAll");
    const allottedData = allotResult.recordset || [];

    // ==========================================
    // 4. Fetch Query 2: Attendance Employees
    // ==========================================
    const attendReq = pool.request();
    if (FromDate) attendReq.input("FromDate", sql.Date, FromDate);
    if (ToDate) attendReq.input("ToDate", sql.Date, ToDate);
    if (companyCode) attendReq.input("CompanyCode", sql.Int, parseInt(companyCode));
    if (ShiftCode) attendReq.input("ShiftCode", sql.Int, parseInt(ShiftCode));
    
    // Add the hardcoded EmpAllot parameter
    attendReq.input("EmpAllot", sql.Int, 1);

    const attendResult = await attendReq.execute("sp_Employee_Attendance");
    const attendanceData = attendResult.recordset || [];

    // ==========================================
    // 5. Merge and Remove Duplicates
    // ==========================================
    // Combine both arrays into one massive array
    const combinedData = [...allottedData, ...attendanceData];

    const seenEmployees = new Set();
    const uniqueData = combinedData.filter((item) => {
      // Use EmployeeID (e.g., "C6207") since both APIs share this identifier
      const empId = item.EmployeeID;
      
      // If empId is missing or we've already seen it, filter it out
      if (!empId || seenEmployees.has(empId)) {
        return false;
      }
      
      // Otherwise, mark it as seen and keep it
      seenEmployees.add(empId);
      return true;
    });

    // 6. Send Response
    res.status(200).json({
      success: true,
      totalEmployees: uniqueData.length,
      data: uniqueData, 
    });

  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// export const getUniqueEmployeeAllotments = async (req, res) => {
//   try {
//     const { FromDate, ToDate, DepartmentCode, ShiftCode } = req.query;
//     const companyCode = req.headers["companyCode"] || req.headers["companycode"];

//     // 1. Validate Database connection header
//     if (!req.headers.subdbname) {
//       return res.status(400).json({ success: false, message: "Missing subDBName header" });
//     }

//     // 2. Connect to the database
//     const pool = await getPool(req.headers.subdbname);
//     const request = pool.request();

//     // 3. Bind the parameters
//     if (FromDate) request.input("FromDate", sql.Date, FromDate);
//     if (ToDate) request.input("ToDate", sql.Date, ToDate);
//     if (DepartmentCode) request.input("DepartmentCode", sql.Int, parseInt(DepartmentCode));
//     if (ShiftCode) request.input("ShiftCode", sql.Int, parseInt(ShiftCode));
//     if (companyCode) request.input("CompanyCode", sql.Int, parseInt(companyCode));
//     const bCode = req.headers["branchCode"] || req.headers["branchcode"];
//     const isBranchCodeUsed = bCode && req.headers.subdbname === "KPF";
    
//     // If KPF and bCode exist, we filter by BranchCode. Otherwise, we filter by CompanyCode.
//     const filterSql = isBranchCodeUsed 
//       ? " AND BranchCode = @BranchCode" 
//       : " AND CompanyCode = @CompanyCode";

//     // 5. Fetch Shifts (FILTER APPLIED HERE)
//     const shiftRequest = pool.request();
//     applyBranchCode(shiftRequest, req.headers);
//     // 4. Execute the Stored Procedure
//     const result = await request.execute("sp_EmployeeAllotmentDetails_GetAll");
//     const rawData = result.recordset;

//     // 5. Remove Duplicate EmployeeCodes
//     const seenEmployees = new Set();
//     const uniqueData = rawData.filter((item) => {
//       // If we have already seen this EmployeeCode, filter it out (return false)
//       if (seenEmployees.has(item.EmployeeCode)) {
//         return false;
//       }
      
//       // Otherwise, add it to our seen list and keep it (return true)
//       seenEmployees.add(item.EmployeeCode);
//       return true;
//     });

//     // 6. Send Response
//     res.status(200).json({
//       success: true,
//       totalEmployees: uniqueData.length,
//       data: uniqueData, 
//     });

//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// };