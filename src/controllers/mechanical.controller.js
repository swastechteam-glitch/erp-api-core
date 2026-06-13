// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const getSchedulePendApproval = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // Connect to the database
//      if (!req.headers.subdbname)
//           return res
//             .status(400)
//             .json({ success: false, message: "Missing subDBName" });
    
//         const pool = await getPool(req.headers.subdbname);
    

//     // Run query against view instead of stored procedure
//     const result = await pool
//       .request()
//       .query(`
//         SELECT ScheduleApproveEntryDate,MachineCode,MachineName,ServiceActivityCode,ServiceActivityName,ToBeDoneDate, LastDoneDate, Reason 
//         From vw_ScheduleApproveEntry Where ApproveStage1 IS NULL
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
//   console.log(companyCode, 'companyCode 98799');
  
//   if (bCode) {
//     request.input("BranchCode", sql.Int, parseInt(bCode));
//   }
//   if (companyCode) {
//     request.input("CompanyCode", sql.Int, parseInt(companyCode));
//   }
// };

export const getSchedulePendApproval = async (req, res) => {
  try {
    const paramData = req.query;

    // Extract pagination params with defaults
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    // Connect to the database
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Base query
    let query = `
        SELECT ScheduleApproveEntryDate, MachineCode, MachineName, ServiceActivityCode, ServiceActivityName, ToBeDoneDate, LastDoneDate, Reason 
        FROM vw_ScheduleApproveEntry 
        WHERE ApproveStage1 IS NULL
    `;

    // ✅ Fix: Append BranchCode filter if header exists
    if (applyBranchCode(request, req.headers)) {
      query += " AND BranchCode = @BranchCode";
    }

    // Run query
    const result = await request.query(query);

    const data = result.recordset;

    // Add id field if needed
    const results = data.map((item) => {
      // Note: Make sure 'WasteInvoiceCode' exists in your view, otherwise this ID will be undefined.
      // You might want to combine columns for a unique ID if a single code isn't available.
      return { ...item, id: item.WasteInvoiceCode || Math.random() }; 
    });

    // Apply pagination manually
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