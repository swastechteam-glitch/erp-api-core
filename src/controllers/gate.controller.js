// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";


// export const getGateEntryGoodsOut = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // const companyCode = parseInt(paramData?.companyCode);
//     // // const goodsOutPassCode = parseInt(paramData?.goodsOutPassCode);

//     // if (!companyCode) {
//     //   return res.status(400).json({ error: "Missing required parameters" });
//     // }

//         if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Step 1: get chkApproval
//     const chkApprovalResult = await pool
//       .request()
//       .query(
//         "SELECT ISNULL(GateGoodsOutEntry_Approval,0) AS GateGoodsOutEntry_Approval FROM tbl_Setting"
//       );

//     const chkApproval =
//       chkApprovalResult.recordset[0].GateGoodsOutEntry_Approval;

//     // Step 2: Build query based on chkApproval
//     let query = "";
//     if (chkApproval === 1) {
//       query = `
//         SELECT GoodsPassNumber, CompanyName, GoodsOutPassCode, DepartmentName,GoodsTypeName,TransGoodsTypeName,StoreOutDate,Store_OutTime
//         FROM vw_GateEntryGoodsOut
//         WHERE CompanyCode = @CompanyCode
//           AND StoreOutDate IS NOT NULL
//           AND Approval_Stage1 IS NOT NULL
//           AND GateOutDate IS NULL
//       `;
//     } else if (chkApproval === 2) {
//       query = `
//         SELECT GoodsPassNumber, CompanyName, GoodsOutPassCode,DepartmentName,GoodsTypeName,TransGoodsTypeName,StoreOutDate,Store_OutTime
//         FROM vw_GateEntryGoodsOut
//         WHERE CompanyCode = @CompanyCode
//           AND StoreOutDate IS NOT NULL
//           AND Approval_Stage1 IS NOT NULL
//           AND Approval_Stage2 IS NOT NULL
//           AND GateOutDate IS NULL
//       `;
//     }

//     if (!query) {
//       return res.status(200).json({ data: [], message: "No approval stage set" });
//     }

//     // Step 3: Execute query
//     const result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       // .input("GoodsOutPassCode", sql.Int, goodsOutPassCode)
//       .query(query);

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
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err });
//   }
// };

// export const getVehicleInOut = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//         if (!req.headers.subdbname)
//           return res
//             .status(400)
//             .json({ success: false, message: "Missing subDBName" });
    
//         const pool = await getPool(req.headers.subdbname);
  
//     let query = "";
//       query = `
//         SELECT VehicleInOutPassCode,VehiclePassnumber,VehiclePassDate,str_EmployeeID,RegistrationNumber,Reason
//         FROM vw_GateEntryVehicleInOut
//         WHERE CompanyCode = @CompanyCode
//           AND Approval = 0
//        Order by VehiclePassDate DESC,VehiclePassnumber DESC
//       `;
    
//        // Step 3: Execute query
//     const result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       // .input("GoodsOutPassCode", sql.Int, goodsOutPassCode)
//       .query(query);

//     const data = result.recordset;
//     let results = data.map((item) => {
//       const addId = Object.assign({ ...item, id: item.VehicleInOutPassCode });
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
//     res.status(500).json({ error: err });
//   }
// };



import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { applyBranchCode, showBranchDropDown } from "../utils/common.js";

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

// export const getGateEntryGoodsOut = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Step 1: get chkApproval
//     const chkApprovalResult = await pool
//       .request()
//       .query(
//         "SELECT ISNULL(GateGoodsOutEntry_Approval,0) AS GateGoodsOutEntry_Approval FROM tbl_Setting"
//       );

//     const chkApproval =
//       chkApprovalResult.recordset[0].GateGoodsOutEntry_Approval;

//     // Step 2: Build query based on chkApproval
//     let query = "";
//     if (chkApproval === 1) {
//       query = `
//         SELECT GoodsPassNumber, CompanyName, GoodsOutPassCode, DepartmentName,GoodsTypeName,TransGoodsTypeName,StoreOutDate,Store_OutTime
//         FROM vw_GateEntryGoodsOut
//         WHERE CompanyCode = @CompanyCode
//           AND StoreOutDate IS NOT NULL
//           AND Approval_Stage1 IS NOT NULL
//           AND GateOutDate IS NULL
//       `;
//     } else if (chkApproval === 2) {
//       query = `
//         SELECT GoodsPassNumber, CompanyName, GoodsOutPassCode,DepartmentName,GoodsTypeName,TransGoodsTypeName,StoreOutDate,Store_OutTime
//         FROM vw_GateEntryGoodsOut
//         WHERE CompanyCode = @CompanyCode
//           AND StoreOutDate IS NOT NULL
//           AND Approval_Stage1 IS NOT NULL
//           AND Approval_Stage2 IS NOT NULL
//           AND GateOutDate IS NULL
//       `;
//     }

//     if (!query) {
//       return res
//         .status(200)
//         .json({ data: [], message: "No approval stage set" });
//     }

//     // ✅ Step 3: Prepare Request & Append BranchCode Logic
//     const request = pool.request();
    
//     // If BranchCode exists in header, add parameter and append SQL filter
//     if (applyBranchCode(request, req.headers)) {
//       query += " AND BranchCode = @BranchCode";
//     }

//     // Execute query
//     const result = await request
//       // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .query(query);

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
//     console.error("DB Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

export const getGateEntryGoodsOut = async (req, res) => {
  try {
    const paramData = req.query;

    // Extract pagination params with safety defaults
    const requestedPage = Math.max(1, parseInt(paramData?.page) || 1);
    const pageSize = Math.max(1, parseInt(paramData?.pageSize) || 5);

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    // Step 1: get chkApproval
    const chkApprovalResult = await pool
      .request()
      .query(
        "SELECT ISNULL(GateGoodsOutEntry_Approval,0) AS GateGoodsOutEntry_Approval FROM tbl_Setting"
      );

    const chkApproval = chkApprovalResult.recordset[0].GateGoodsOutEntry_Approval;

    // ✅ Step 2: Prepare Request first
    const request = pool.request();

    // ✅ Step 3: Determine the Company/Branch filter dynamically
    let companyFilter = "";
      console.log(req.headers.subdbname, 'req.headers.subdbname212131');
      const subdbname = showBranchDropDown(req.headers.subdbname);
      
    if (subdbname) {
      // If KPF, use variables and call applyBranchCode
      companyFilter = "CompanyCode = @CompanyCode";
      
      const bCode = req.headers["branchCode"] || req.headers["branchcode"];
      if (bCode) {
        companyFilter += " AND BranchCode = @BranchCode";
      }
      
      // Bind the @CompanyCode and @BranchCode values to the request
      applyBranchCode(request, req.headers);
      
    } else {
      // If NOT KPF, statically show 1 and do NOT call applyBranchCode
      companyFilter = "CompanyCode = 1";
    }

    // ✅ Step 4: Build query injecting the companyFilter
    let query = "";
    if (chkApproval === 1) {
      query = `
        SELECT GoodsPassNumber, CompanyName, GoodsOutPassCode, DepartmentName,GoodsTypeName,TransGoodsTypeName,StoreOutDate,Store_OutTime
        FROM vw_GateEntryGoodsOut
        WHERE ${companyFilter}
          AND StoreOutDate IS NOT NULL
          AND Approval_Stage1 IS NOT NULL
          AND GateOutDate IS NULL
      `;
    } else if (chkApproval === 2) {
      query = `
        SELECT GoodsPassNumber, CompanyName, GoodsOutPassCode,DepartmentName,GoodsTypeName,TransGoodsTypeName,StoreOutDate,Store_OutTime
        FROM vw_GateEntryGoodsOut
        WHERE ${companyFilter}
          AND StoreOutDate IS NOT NULL
          AND Approval_Stage1 IS NOT NULL
          AND Approval_Stage2 IS NOT NULL
          AND GateOutDate IS NULL
      `;
    }

    if (!query) {
      return res
        .status(200)
        .json({ data: [], message: "No approval stage set" });
    }

    // ✅ Step 5: Execute query
    const result = await request.query(query);

    // ✅ Step 6: Apply pagination manually with safety checks
    const data = result.recordset || [];
    const totalRecords = data.length;
    const totalPages = Math.ceil(totalRecords / pageSize);

    // Fallback to page 1 if the requested page is empty/out of range
    const currentPage = requestedPage > totalPages && totalPages > 0 ? 1 : requestedPage;
    const offset = (currentPage - 1) * pageSize;

    let results = data.map((item) => ({ ...item, id: item.GoodsOutPassCode }));
    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      totalRecords: totalRecords,
      currentPage: currentPage,
      pageSize: pageSize,
      totalPages: totalPages,
      data: paginatedData,
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
};


export const getVehicleInOut = async (req, res) => {
  try {
    const paramData = req.query;

    // Extract pagination params with defaults
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    // Base Query
    let query = `
        SELECT VehicleInOutPassCode,VehiclePassnumber,VehiclePassDate,str_EmployeeID,RegistrationNumber,Reason
        FROM vw_GateEntryVehicleInOut
        WHERE CompanyCode = @CompanyCode
        AND Approval = 0
      `;

    // ✅ Step 2: Prepare Request & Append BranchCode Logic
    const request = pool.request();

    // If BranchCode exists in header, add parameter and append SQL filter
    if (applyBranchCode(request, req.headers)) {
      query += " AND BranchCode = @BranchCode";
    }

    // Add Ordering at the end
    query += " ORDER BY VehiclePassDate DESC, VehiclePassnumber DESC";

    // Step 3: Execute query
    const result = await request
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .query(query);

    const data = result.recordset;
    let results = data.map((item) => {
      const addId = Object.assign({ ...item, id: item.VehicleInOutPassCode });
      return addId;
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