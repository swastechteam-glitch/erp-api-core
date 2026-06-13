// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const getEmployeeApproval = async (req, res) => {
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

//     // Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_Employee_GetAll_PendApprove");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.EmployeeCode });
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

// export const getAttnManualEntryApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

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
//     let result = await pool
//       .request()
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_ManualEntryApproval_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.ManualCode });
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

// export const getEmpWiseIncApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

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
//     let result = await pool
//       .request()
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_IncrementApproval_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.IncrementCode });
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

// export const getGradeWiseIncApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

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
//     let result = await pool
//       .request()
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_IncrementApproval_1_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.IncrementCode });
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

// export const getOnDutyApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

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
//     let result = await pool
//       .request()
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_OnDutyEntryApproval_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.OnDutyEntryCode });
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

// export const getCompensationApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

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
//     let result = await pool
//       .request()
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_CompensationWorkEntryApproval_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({
//         ...item,
//         id: item.CompensationWorkEntryCode,
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
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getLeaveEntryApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

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
//     let result = await pool
//       .request()
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .execute("web_sp_LeaveEntryApproval_Pendings");

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.LeaveEntryCode });
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

import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { applyBranchCode } from "../utils/common.js";

export const updateNewJoinApproval = async (req, res) => {
  try {
    // Using req.body is standard for Update/POST/PUT requests
    const paramData = req.body; 
    const userId = req.headers.userId
    const nodeCode = req.headers.nodeCode
    if (!req.headers.subdbname) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing subDBName" 
      });
    }

    // Extract parameters from the request body
    const approval = paramData.Approval !== undefined ? parseInt(paramData.Approval) : 0;
    const reject = paramData.Reject !== undefined ? parseInt(paramData.Reject) : 0;
    // const userCode = paramData.UserCode;
    // const nodeCode = paramData.NodeCode;
    const companyCode = paramData.CompanyCode;
    const employeeCode = paramData.EmployeeCode;
    console.log(paramData, userId, nodeCode, 8877711);
    
    // Validate required parameters based on your SP requirements
    if (!companyCode || !employeeCode || !userId || !nodeCode) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required parameters: CompanyCode, EmployeeCode, UserCode, or NodeCode" 
      });
    }

    // Ensure they are actually trying to approve or reject
    if (approval === 0 && reject === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Must specify either Approval = 1 or Reject = 1" 
      });
    }

    // Initialize database connection and request
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Bind parameters to the stored procedure
    // Note: Sending 0 for the flag that isn't triggered, assuming your SP handles it
    request.input("Approval", approval);
    request.input("Reject", reject);
    request.input("UserCode", userId);
    request.input("NodeCode", nodeCode);
    request.input("CompanyCode", companyCode);
    request.input("EmployeeCode", employeeCode);

    // Execute the Update stored procedure
    let result = await request.execute("sp_NewJoinApproval_Update");

    // Send the response
    res.status(200).json({
      success: true,
      message: approval === 1 ? "Employee approved successfully" : "Employee rejected successfully",
      // Include result.recordset if your SP ends with a SELECT statement to return the updated row
      data: result.recordset ? result.recordset : [] 
    });

  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getEmployeeApproval = async (req, res) => {
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
      .execute("web_sp_Employee_GetAll_PendApprove");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.EmployeeCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};



export const getAttnManualEntryApproval = async (req, res) => {
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

    let result = await request.execute("web_sp_ManualEntryApproval_Pendings");

    const data = result.recordset;
    console.log(data, result, "data 234242");

    let results = data.map((item) => ({ ...item, id: item.ManualCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getEmpWiseIncApproval = async (req, res) => {
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
    // if (req.headers.subdbname != "KPF" && request.parameters && request.parameters.BranchCode) {
    //   delete request.parameters.BranchCode;
    // }else{
    //    delete request.parameters.CompanyCode;
    // }
    let result = await request.execute("web_sp_IncrementApproval_Pendings");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.IncrementCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getGradeWiseIncApproval = async (req, res) => {
  try {
    const paramData = req.query;
    // const page = parseInt(paramData?.page) || 1;
    // const pageSize = parseInt(paramData?.pageSize) || 5;
    // const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);
    if (req.headers.subdbname == "SKT") {
      request.input("EffectDate", paramData.selectedDate);
    }
    //  request.input("EffectDate", "2026-04-10");
    // if (req.headers.subdbname != "KPF" && request.parameters.BranchCode) {
    //   delete request.parameters.BranchCode;
    // }else{
    //    delete request.parameters.CompanyCode;
    // }
    let result = await request.execute("web_sp_IncrementApproval_1_Pendings");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.IncrementCode }));
    // const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      // currentPage: page,
      // pageSize: pageSize,
      // totalPages: Math.ceil(data.length / pageSize),
      data: results,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getEffectDateLimits = async (req, res) => {
  try {
    if (!req.headers.subdbname) {
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });
    }

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fetch minimum unfinalized date and current server date
    const dateResult = await request.query(`
      SELECT 
        MIN(PayPeriodFrom) AS MinDate, 
        CAST(GETDATE() AS DATE) AS MaxDate 
      FROM tbl_PayPeriod 
      WHERE Finalize = 0
    `);

    if (dateResult.recordset.length > 0 && dateResult.recordset[0].MinDate) {
      // Format dates to YYYY-MM-DD for clean frontend usage
      const minDate = new Date(dateResult.recordset[0].MinDate).toLocaleDateString("en-CA");
      const maxDate = new Date(dateResult.recordset[0].MaxDate).toLocaleDateString("en-CA");

      return res.status(200).json({
        success: true,
        minDate: minDate,
        maxDate: maxDate,
      });
    } else {
      // Fallback just in case there are no unfinalized periods
      const today = new Date().toLocaleDateString("en-CA");
      return res.status(200).json({
        success: true,
        message: "No unfinalized pay periods found.",
        minDate: null,
        maxDate: today,
      });
    }
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getOnDutyApproval = async (req, res) => {
  try {
    const paramData = req.query;
    let page = parseInt(paramData?.page) || 1;
    let pageSize = parseInt(paramData?.pageSize) || 5;

    if (!req.headers.subdbname) {
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });
    }

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    applyBranchCode(request, req.headers);
    // if (request.parameters && request.parameters.CompanyCode) {
    //   delete request.parameters.CompanyCode;
    // }
    const result = await request.execute("web_sp_OnDutyEntryApproval_Pendings");

    const data = result.recordset || [];

    const results = data.map((item) => ({
      ...item,
      id: item.OnDutyEntryCode,
    }));

    const totalRecords = results.length;
    const totalPages = Math.ceil(totalRecords / pageSize);

    // ✅ Safety check
    if (page > totalPages) page = 1;

    const offset = (page - 1) * pageSize;
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords,
      currentPage: page,
      pageSize,
      totalPages,
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getCompensationApproval = async (req, res) => {
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
      "web_sp_CompensationWorkEntryApproval_Pendings",
    );

    const data = result.recordset;
    let results = data.map((item) => ({
      ...item,
      id: item.CompensationWorkEntryCode,
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
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getLeaveEntryApproval = async (req, res) => {
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
    let result = await request.execute("web_sp_LeaveEntryApproval_Pendings");

    const data = result.recordset;
    let results = data.map((item) => ({ ...item, id: item.LeaveEntryCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getWasteApprovalList = async (req, res) => {
  try {
    const paramData = req.query;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    // 1. Validate SubDBName
    if (!req.headers.subdbname) {
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });
    }

    // 2. Extract CompanyCode (Assuming it comes from headers or query)
    // Adjust this if your CompanyCode comes from somewhere else!
    const companyCode = req.headers.companyCode;
    console.log(companyCode, req.headers, "companycode");

    if (!companyCode) {
      return res
        .status(400)
        .json({ success: false, message: "Missing CompanyCode" });
    }

    // 3. Setup DB Connection
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // 4. Apply branch/company contexts
    // Assuming applyBranchCode injects BranchCode into the request parameters
    // if (typeof applyBranchCode === "function") {
    //   applyBranchCode(request, req.headers);
    // }

    // 5. Securely pass CompanyCode as an input parameter to prevent SQL Injection
    request.input("CompanyCode", companyCode);

    // 6. Execute the View Query instead of the Stored Procedure
    const query = `SELECT * FROM vw_WasteInvoiceApproval_Pending WHERE CompanyCode = @CompanyCode`;
    let result = await request.query(query);

    const data = result.recordset;

    // 7. Map the ID properly for the frontend (Update 'WasteInvoiceCode' if your column name is different)
    let results = data.map((item) => ({
      ...item,
      id: item.WasteInvoiceCode || item.ID || item.Id,
    }));

    // 8. Handle Pagination
    const paginatedData = results.slice(offset, offset + pageSize);

    // 9. Send Response
    res.status(200).json({
      totalRecords: data.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getWasteInvoiceItemDetails = async (req, res) => {
  try {
    // 1. Validate SubDBName
    if (!req.headers.subdbname) {
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });
    }

    // 2. Extract Parameters
    // Assuming CompanyCode comes from headers/query and WasteInvoiceCode comes from the query string
    const companyCode = req.headers.companyCode;
    const wasteInvoiceCode = req.params.wasteInvoiceCode;
    console.log(companyCode, wasteInvoiceCode, "9090909");

    if (!companyCode || !wasteInvoiceCode) {
      return res.status(400).json({
        success: false,
        message: "Missing CompanyCode or WasteInvoiceCode",
      });
    }

    // 3. Setup DB Connection
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // 4. Securely attach parameters to the request
    request.input("CompanyCode", companyCode);
    request.input("WasteInvoiceCode", wasteInvoiceCode);

    // 5. Execute the Stored Procedure
    let result = await request.execute("sp_WasteInvoice_GetbyItemDetails");

    const data = result.recordset;

    // 6. Send Response
    res.status(200).json({
      success: true,
      totalItems: data.length,
      data: data,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};


export const getNewJoinApproval = async (req, res) => {
  try {
    const paramData = req.query; // Or req.body if you prefer to send data via POST

    if (!req.headers.subdbname) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing subDBName" 
      });
    }

    // Extract parameters from the request
    const approval = paramData.Approval !== undefined ? parseInt(paramData.Approval) : 0;
    const reject = paramData.Reject !== undefined ? parseInt(paramData.Reject) : 0;
    const companyCode = paramData.CompanyCode;

    // Validate required parameter
    if (!companyCode) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing CompanyCode in the request" 
      });
    }

    // Initialize database connection and request
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Bind parameters to the stored procedure
    request.input("Approval", approval);
    request.input("Reject", reject);
    request.input("CompanyCode", companyCode);

    // Execute the stored procedure
    let result = await request.execute("sp_NewJoinApproval_GetAll");

    const data = result.recordset;

    // Send the response
    res.status(200).json({
      totalRecords: data.length,
      data: data,
    });

  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};