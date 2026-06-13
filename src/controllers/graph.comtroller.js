// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";


// export const getCottonStockBalesWiseGraph = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const fromDate = paramData?.fromDate;
//     const toDate = paramData?.toDate;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("FromDate", sql.DateTime, fromDate)
//       .input("ToDate", sql.DateTime, toDate)
//       .execute("web_sp_Cotton_Stock_BalesWise");

//     const records = result.recordset;

//     // ✅ Group by RawMaterialCode
//     const groupedData = Object.values(
//       records.reduce((acc, item) => {
//         const key = item.RawMaterialCode;
//         if (!acc[key]) {
//           acc[key] = {
//             RawMaterialCode: item.RawMaterialCode,
//             RawMaterialName: item.RawMaterialName,
//             TotalOpeningBales: 0,
//             TotalOpeningKgs: 0,
//             TotalReceiptBales: 0,
//             TotalReceiptKgs: 0,
//             TotalRejectBales: 0,
//             TotalRejectKgs: 0,
//             TotalIssueBales: 0,
//             TotalIssueKgs: 0,
//             TotalClosingBales: 0,
//             TotalClosingKgs: 0,
//             // Details: [], // keep all items if needed for drill-down
//           };
//         }

//         acc[key].TotalOpeningBales += item.OpBaleNo || 0;
//         acc[key].TotalOpeningKgs += item.OPKgs || 0;
//         acc[key].TotalReceiptBales += item.ReceiptBaleNo || 0;
//         acc[key].TotalReceiptKgs += item.ReceiptKgs || 0;
//         acc[key].TotalRejectBales += item.RejectBaleNo || 0;
//         acc[key].TotalRejectKgs += item.RejectKgs || 0;
//         acc[key].TotalIssueBales += item.IssueBaleNo || 0;
//         acc[key].TotalIssueKgs += item.IssueKgs || 0;
//         acc[key].TotalClosingBales += item.ClosingBales || 0;
//         acc[key].TotalClosingKgs += item.ClosingKgs || 0;

//         // acc[key].Details.push(item);

//                 return acc;
//       }, {})
//     );

//      // ✅ Round to 3 decimal places for Kgs values
//     const formattedData = groupedData.map((item) => ({
//       ...item,
//       TotalOpeningKgs: parseFloat(item.TotalOpeningKgs.toFixed(3)),
//       TotalReceiptKgs: parseFloat(item.TotalReceiptKgs.toFixed(3)),
//       TotalRejectKgs: parseFloat(item.TotalRejectKgs.toFixed(3)),
//       TotalIssueKgs: parseFloat(item.TotalIssueKgs.toFixed(3)),
//       TotalClosingKgs: parseFloat(item.TotalClosingKgs.toFixed(3)),
//     }));

//     res.status(200).json({
//       success: true,
//       totalGroups: formattedData.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     console.error("Error fetching cotton stock:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getCottonPOPendingGraph = async (req, res) => {
//   try {
//     const paramData = req.query;

//     const fromDate = paramData?.fromDate;
//     const toDate = paramData?.toDate;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("FromDate", sql.DateTime, fromDate)
//       .input("ToDate", sql.DateTime, toDate)
//       .execute("web_sp_CottonPurchaseOrder_PendingDetails");

//     const records = result.recordset;

//     // ✅ Group by RawMaterialCode
//     const groupedData = Object.values(
//       records.reduce((acc, item) => {
//         const key = item.RawMaterialCode;
//         if (!acc[key]) {
//           acc[key] = {
//             RawMaterialCode: item.RawMaterialCode,
//             RawMaterialName: item.RawMaterialName,
//             TotalOrderQty: 0,
//             TotalPurchaseQty: 0,
//             TotalPendingQty: 0,
//           };
//         }

//         acc[key].TotalOrderQty += item.OrderQty || 0;
//         acc[key].TotalPurchaseQty += item.PurQty || 0;
//         acc[key].TotalPendingQty += item.PendingQty || 0;
//         return acc;
//       }, {})
//     );

//     // 🎨 Define your color palette
//     const colors = [
//       "#0088FE",
//       "#FF8042",
//       "#00C49F",
//       "#FFBB28",
//       "#8884D8",
//       "#A28FED",
//       "#2feb61",
//       "#2febeb",
//       "#de1fce",
//       "#291fde",
//       "#de1f4c",
//       "#de521f",
//     ];

//     // ✅ Assign color to each data item
//     const coloredData = groupedData.map((item, index) => ({
//       ...item,
//       color: colors[index % colors.length], // cycle colors if more items than colors
//     }));

//     // ✅ Return response
//     res.status(200).json({
//       success: true,
//       totalGroups: coloredData.length,
//       data: coloredData,
//     });
//   } catch (err) {
//        res.status(500).json({ error: err.message });
//   }
// };

// export const getProductionAllDepartmentGraph = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const fromDate = paramData?.fromDate;
//     const toDate = paramData?.toDate;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("FromDate", sql.DateTime, fromDate)
//       .input("ToDate", sql.DateTime, toDate)
//       .execute("web_sp_Prodn_Production_All_Department_Abstract");

//     const records = result.recordset;

//     const groupedData = Object.values(
//       records.reduce((acc, item) => {
//         const key = item.DepartmentName;
//         if (!acc[key]) {
//           acc[key] = {
//                       DepartmentName: item.DepartmentName,
//             IShiftProdn: 0,
//             IIShiftProdn: 0,
//             IIIShiftProdn: 0,
//               };
//         }

//         acc[key].IShiftProdn += item.Shift1Kg || 0;
//         acc[key].IIShiftProdn += item.Shift2Kg || 0;
//         acc[key].IIIShiftProdn += item.Shift3Kg || 0;
//                    return acc;
//       }, {})
//     );

//     const formattedData = groupedData.map((item) => ({
//       ...item,
//       IShiftProdn: parseFloat(item.IShiftProdn.toFixed(3)),
//       IIShiftProdn: parseFloat(item.IIShiftProdn.toFixed(3)),
//       IIIShiftProdn: parseFloat(item.IIIShiftProdn.toFixed(3)),
//     }));

//     res.status(200).json({
//       success: true,
//       totalGroups: formattedData.length,
//       data: formattedData,
//     });
//   } catch (err) {
   
//     res.status(500).json({ error: err.message });
//   }
// };


// export const getSpinningProductionGraph = async (req, res) => {
//   try {
//     const paramData = req.query;

//     const fromDate = paramData?.fromDate;
//     const toDate = paramData?.toDate;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute stored procedure
//     let result = await pool
//       .request()
//       .input("FromDate", sql.DateTime, fromDate)
//       .input("ToDate", sql.DateTime, toDate)
//       .execute("web_sp_Prodn_Production_All_Spinning_Abstract");

//     const records = result.recordset;

//     // ✅ Transform data into grouped structure by CountName
//     const formattedData = {};

//     records.forEach((item) => {
//       const countName = item.CountName || "Unknown";

//       // Calculate Delta (difference between Prodn and Target)
//       const delta = parseFloat((item.UptoDateProdnkg - item.TotTargetProd).toFixed(3));

//       formattedData[countName] = [
//         { name: "I Shift KGS", value: item.Shift1Kg },
//         { name: "I Shift GPS", value: item.Shift1GPS },
//         { name: "II Shift KGS", value: item.Shift2Kg },
//         { name: "II Shift GPS", value: item.Shift2GPS },
//         { name: "III Shift KGS", value: item.Shift3Kg },
//         { name: "III Shift GPS", value: item.Shift3GPS },
//         { name: "Today Prodn. KGS", value: item.TodayProdnKg },
//         { name: "Upto Date I Shift Prodn.", value: item.Shift1Kg }, // replace if separate field exists
//         { name: "Upto Date II Shift Prodn.", value: item.Shift2Kg }, // replace if separate field exists
//         { name: "Upto Date III Shift Prodn.", value: item.Shift3Kg }, // replace if separate field exists
//         { name: "Upto Date Prodn.", value: item.UptoDateProdnkg },
//         { name: "Total Target Prodn.", value: item.TotTargetProd },
//         { name: "Prodn. KGS vs Target KGS", value: delta },
//       ];
//     });

//     res.status(200).json({
//       success: true,
//       totalRecords: records.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     console.error("Error fetching spinning production graph:", err);
//     res.status(500).json({ error: err.message });
//   }
// };


// export const getAutoconerProductionGraph = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const fromDate = paramData?.fromDate;
//     const toDate = paramData?.toDate;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("FromDate", sql.DateTime, fromDate)
//       .input("ToDate", sql.DateTime, toDate)
//       .execute("web_sp_Prodn_Production_All_Autoconer_Abstract");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
   
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getYarnStockGraph = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const fromDate = paramData?.fromDate;
//     const toDate = paramData?.toDate;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("FromDate", sql.DateTime, fromDate)
//       .input("ToDate", sql.DateTime, toDate)
//       .execute("web_sp_YarnStock_CountWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
   
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getYarnProductionGraph = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const fromDate = paramData?.fromDate;
//     const toDate = paramData?.toDate;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("FromDate", sql.DateTime, fromDate)
//       .input("ToDate", sql.DateTime, toDate)
//       .execute("web_sp_YarnProduction_GetAll");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
   
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getEmployeeAttendanceGraph = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const fromDate = paramData?.fromDate;
//     const toDate = paramData?.toDate;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("FromDate", sql.DateTime, fromDate)
//       .input("ToDate", sql.DateTime, toDate)
//       .execute("web_sp_Employee_Attendance");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
   
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getStoreIssueGraph = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Extract pagination params with defaults
//     const fromDate = paramData?.fromDate;
//     const toDate = paramData?.toDate;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // 3. Execute the stored procedure
//     let result = await pool
//       .request()
//       .input("FromDate", sql.DateTime, fromDate)
//       .input("ToDate", sql.DateTime, toDate)
//       .execute("web_sp_IssueDetails_GetAll");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
   
//     res.status(500).json({ error: err.message });
//   }
// };


// 9 functions

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

export const getCottonStockBalesWiseGraph = async (req, res) => {
  try {
    const paramData = req.query;
    const fromDate = paramData?.fromDate;
    const toDate = paramData?.toDate;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    
    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("FromDate", sql.DateTime, fromDate)
      .input("ToDate", sql.DateTime, toDate)
      .execute("web_sp_Cotton_Stock_BalesWise");

    const records = result.recordset;

    // Group by RawMaterialCode
    const groupedData = Object.values(
      records.reduce((acc, item) => {
        const key = item.RawMaterialCode;
        if (!acc[key]) {
          acc[key] = {
            RawMaterialCode: item.RawMaterialCode,
            RawMaterialName: item.RawMaterialName,
            TotalOpeningBales: 0,
            TotalOpeningKgs: 0,
            TotalReceiptBales: 0,
            TotalReceiptKgs: 0,
            TotalRejectBales: 0,
            TotalRejectKgs: 0,
            TotalIssueBales: 0,
            TotalIssueKgs: 0,
            TotalClosingBales: 0,
            TotalClosingKgs: 0,
          };
        }

        acc[key].TotalOpeningBales += item.OpBaleNo || 0;
        acc[key].TotalOpeningKgs += item.OPKgs || 0;
        acc[key].TotalReceiptBales += item.ReceiptBaleNo || 0;
        acc[key].TotalReceiptKgs += item.ReceiptKgs || 0;
        acc[key].TotalRejectBales += item.RejectBaleNo || 0;
        acc[key].TotalRejectKgs += item.RejectKgs || 0;
        acc[key].TotalIssueBales += item.IssueBaleNo || 0;
        acc[key].TotalIssueKgs += item.IssueKgs || 0;
        acc[key].TotalClosingBales += item.ClosingBales || 0;
        acc[key].TotalClosingKgs += item.ClosingKgs || 0;

        return acc;
      }, {})
    );

    const formattedData = groupedData.map((item) => ({
      ...item,
      TotalOpeningKgs: parseFloat(item.TotalOpeningKgs.toFixed(3)),
      TotalReceiptKgs: parseFloat(item.TotalReceiptKgs.toFixed(3)),
      TotalRejectKgs: parseFloat(item.TotalRejectKgs.toFixed(3)),
      TotalIssueKgs: parseFloat(item.TotalIssueKgs.toFixed(3)),
      TotalClosingKgs: parseFloat(item.TotalClosingKgs.toFixed(3)),
    }));

    res.status(200).json({
      success: true,
      totalGroups: formattedData.length,
      data: formattedData,
    });
  } catch (err) {
    console.error("Error fetching cotton stock:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getCottonPOPendingGraph = async (req, res) => {
  try {
    const paramData = req.query;
    const fromDate = paramData?.fromDate;
    const toDate = paramData?.toDate;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    
    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("FromDate", sql.DateTime, fromDate)
      .input("ToDate", sql.DateTime, toDate)
      .execute("web_sp_CottonPurchaseOrder_PendingDetails");

    const records = result.recordset;

    const groupedData = Object.values(
      records.reduce((acc, item) => {
        const key = item.RawMaterialCode;
        if (!acc[key]) {
          acc[key] = {
            RawMaterialCode: item.RawMaterialCode,
            RawMaterialName: item.RawMaterialName,
            TotalOrderQty: 0,
            TotalPurchaseQty: 0,
            TotalPendingQty: 0,
          };
        }

        acc[key].TotalOrderQty += item.OrderQty || 0;
        acc[key].TotalPurchaseQty += item.PurQty || 0;
        acc[key].TotalPendingQty += item.PendingQty || 0;
        return acc;
      }, {})
    );

    const colors = [
      "#0088FE", "#FF8042", "#00C49F", "#FFBB28", "#8884D8", "#A28FED",
      "#2feb61", "#2febeb", "#de1fce", "#291fde", "#de1f4c", "#de521f",
    ];

    const coloredData = groupedData.map((item, index) => ({
      ...item,
      color: colors[index % colors.length],
    }));

    res.status(200).json({
      success: true,
      totalGroups: coloredData.length,
      data: coloredData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getProductionAllDepartmentGraph = async (req, res) => {
  try {
    const paramData = req.query;
    const fromDate = paramData?.fromDate;
    const toDate = paramData?.toDate;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    
    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("FromDate", sql.DateTime, fromDate)
      .input("ToDate", sql.DateTime, toDate)
      .execute("web_sp_Prodn_Production_All_Department_Abstract");

    const records = result.recordset;

    const groupedData = Object.values(
      records.reduce((acc, item) => {
        const key = item.DepartmentName;
        if (!acc[key]) {
          acc[key] = {
            DepartmentName: item.DepartmentName,
            IShiftProdn: 0,
            IIShiftProdn: 0,
            IIIShiftProdn: 0,
          };
        }

        acc[key].IShiftProdn += item.Shift1Kg || 0;
        acc[key].IIShiftProdn += item.Shift2Kg || 0;
        acc[key].IIIShiftProdn += item.Shift3Kg || 0;
        return acc;
      }, {})
    );

    const formattedData = groupedData.map((item) => ({
      ...item,
      IShiftProdn: parseFloat(item.IShiftProdn.toFixed(3)),
      IIShiftProdn: parseFloat(item.IIShiftProdn.toFixed(3)),
      IIIShiftProdn: parseFloat(item.IIIShiftProdn.toFixed(3)),
    }));

    res.status(200).json({
      success: true,
      totalGroups: formattedData.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getSpinningProductionGraph = async (req, res) => {
  try {
    const paramData = req.query;
    const fromDate = paramData?.fromDate;
    const toDate = paramData?.toDate;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    
    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("FromDate", sql.DateTime, fromDate)
      .input("ToDate", sql.DateTime, toDate)
      .execute("web_sp_Prodn_Production_All_Spinning_Abstract");

    const records = result.recordset;

    const formattedData = {};

    records.forEach((item) => {
      const countName = item.CountName || "Unknown";
      const delta = parseFloat((item.UptoDateProdnkg - item.TotTargetProd).toFixed(3));

      formattedData[countName] = [
        { name: "I Shift KGS", value: item.Shift1Kg },
        { name: "I Shift GPS", value: item.Shift1GPS },
        { name: "II Shift KGS", value: item.Shift2Kg },
        { name: "II Shift GPS", value: item.Shift2GPS },
        { name: "III Shift KGS", value: item.Shift3Kg },
        { name: "III Shift GPS", value: item.Shift3GPS },
        { name: "Today Prodn. KGS", value: item.TodayProdnKg },
        { name: "Upto Date I Shift Prodn.", value: item.Shift1Kg },
        { name: "Upto Date II Shift Prodn.", value: item.Shift2Kg },
        { name: "Upto Date III Shift Prodn.", value: item.Shift3Kg },
        { name: "Upto Date Prodn.", value: item.UptoDateProdnkg },
        { name: "Total Target Prodn.", value: item.TotTargetProd },
        { name: "Prodn. KGS vs Target KGS", value: delta },
      ];
    });

    res.status(200).json({
      success: true,
      totalRecords: records.length,
      data: formattedData,
    });
  } catch (err) {
    console.error("Error fetching spinning production graph:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getAutoconerProductionGraph = async (req, res) => {
  try {
    const paramData = req.query;
    const fromDate = paramData?.fromDate;
    const toDate = paramData?.toDate;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    
    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("FromDate", sql.DateTime, fromDate)
      .input("ToDate", sql.DateTime, toDate)
      .execute("web_sp_Prodn_Production_All_Autoconer_Abstract");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getYarnStockGraph = async (req, res) => {
  try {
    const paramData = req.query;
    const fromDate = paramData?.fromDate;
    const toDate = paramData?.toDate;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    
    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("FromDate", sql.DateTime, fromDate)
      .input("ToDate", sql.DateTime, toDate)
      .execute("web_sp_YarnStock_CountWise");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getYarnProductionGraph = async (req, res) => {
  try {
    const paramData = req.query;
    const fromDate = paramData?.fromDate;
    const toDate = paramData?.toDate;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    
    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("FromDate", sql.DateTime, fromDate)
      .input("ToDate", sql.DateTime, toDate)
      .execute("web_sp_YarnProduction_GetAll");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getEmployeeAttendanceGraph = async (req, res) => {
  try {
    const paramData = req.query;
    const fromDate = paramData?.fromDate;
    const toDate = paramData?.toDate;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    
    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("FromDate", sql.DateTime, fromDate)
      .input("ToDate", sql.DateTime, toDate)
      .execute("web_sp_Employee_Attendance");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getStoreIssueGraph = async (req, res) => {
  try {
    const paramData = req.query;
    const fromDate = paramData?.fromDate;
    const toDate = paramData?.toDate;

    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    
    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("FromDate", sql.DateTime, fromDate)
      .input("ToDate", sql.DateTime, toDate)
      .execute("web_sp_IssueDetails_GetAll");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};