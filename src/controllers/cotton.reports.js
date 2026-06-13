// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const getCottonReports = async (req, res) => {
//   try {
//     const paramData = req.query;
//     // Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Create a request object
//     const request = pool
//       .request()
//       .input("FromDate", sql.DateTime, paramData?.fromDate)
//       .input("ToDate", sql.DateTime, paramData?.toDate)
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode));


//     let procedureName = "";

//     // Determine which stored procedure to execute
//     if (paramData.parentHeader === "cotton-po-report") {
//       if (paramData.childHeader === "supplier-wise") {
//         procedureName = "web_sp_CottonPurchaseOrder_GetAll";
//       } else if (paramData.childHeader === "pendings") {
//         procedureName = "web_sp_CottonPurchaseOrder_PendingDetails";
//       }
//     } else if (paramData.parentHeader === "cotton-weighment-report") {
//       if (paramData.childHeader === "supplier-wise") {
//         procedureName = "web_sp_CottonWeighment_GetAll";
//       }
//     } else if (paramData.parentHeader === "cotton-mixing-issue-report") {
//       request.input("IssueType", sql.NVarChar(5), "ISSUE");
//       if (paramData.childHeader === "count-wise") {
//         procedureName = "web_sp_CottonIssueDetails_GetAll";
//       }
//     } else if (paramData.parentHeader === "cotton-stock-report") {
//       if (paramData.childHeader === "variety-wise") {
//         request.input("Web", sql.Bit, true);
//         procedureName = "web_sp_Cotton_Stock_BalesWise";
//       } else if (paramData.childHeader === "rm-type-wise") {
//         procedureName = "web_sp_Cotton_Stock";
//       }
//     }

//     if (!procedureName) {
//       return res.status(400).json({ error: "Invalid report parameters" });
//     }

//     // Execute the stored procedure
//     const result = await request.execute(procedureName);
//     let data = result.recordset || [];

//     // ✅ Count non-zero entries per VarietyName
//     if (
//       paramData.parentHeader === "cotton-stock-report" &&
//       paramData.childHeader === "variety-wise"
//     ) {
//       const grouped = {};

//       data.forEach((row) => {
//         const key = row.VarietyName || "UNKNOWN";
//         if (!grouped[key]) {
//           grouped[key] = {
//             VarietyName: key,
//             OpBaleNo: 0,
//             OPKgs: 0,
//             ReceiptBaleNo: 0,
//             ReceiptKgs: 0,
//             IssueBaleNo: 0,
//             IssueKgs: 0,
//             ClosingBales: 0,
//             ClosingKgs: 0,
//           };
//         }

//         // ✅ Count how many rows have non-zero values
//         grouped[key].OpBaleNo += row.OpBaleNo && row.OpBaleNo !== 0 ? 1 : 0;
//         grouped[key].ReceiptBaleNo +=
//           row.ReceiptBaleNo && row.ReceiptBaleNo !== 0 ? 1 : 0;
//         grouped[key].IssueBaleNo +=
//           row.IssueBaleNo && row.IssueBaleNo !== 0 ? 1 : 0;
//         grouped[key].ClosingBales +=
//           row.ClosingBales && row.ClosingBales !== 0 ? 1 : 0;

//         // ✅ Keep Kgs fields as total sums
//         grouped[key].OPKgs += row.OPKgs || 0;
//         grouped[key].ReceiptKgs += row.ReceiptKgs || 0;
//         grouped[key].IssueKgs += row.IssueKgs || 0;
//         grouped[key].ClosingKgs += row.ClosingKgs || 0;
//       });

//       Object.values(grouped).forEach((g) => {
//         g.OPKgs = g.OPKgs.toFixed(2);
//         g.ReceiptKgs = g.ReceiptKgs.toFixed(2);
//         g.IssueKgs = g.IssueKgs.toFixed(2);
//         g.ClosingKgs = g.ClosingKgs.toFixed(2);
//       });

//       data = Object.values(grouped);
//     }

//     // ✅ Special handling for "cotton-mixing-issue-report" > "count-wise"
//     if (
//       paramData.parentHeader === "cotton-mixing-issue-report" &&
//       paramData.childHeader === "count-wise"
//     ) {
//       const grouped = {};

//       data.forEach((row) => {
//         const key = `${row.CottonCountCode || 0}_${row.RawMaterialCode || 0}`;
//         if (!grouped[key]) {
//           grouped[key] = {
//             CottonCountCode: row.CottonCountCode,
//             CottonCountName: row.CottonCountName,
//             RawMaterialCode: row.RawMaterialCode,
//             RawMaterialName: row.RawMaterialName,
//             BaleCount: 0,
//             SumCurrentWt: 0,
//             SumAllowance: 0,
//             SumTareWeight: 0,
//             SumSampleWeight: 0,
//             TotalWeight: 0,
//             NetWeight: 0,
//             Percent: 0,
//             ActGrossValue: 0,
//             NetRatePerKgTotal: 0,
//             ExmillRateTotal: 0,
//             AvgNetRatePerKg: 0,
//             AvgExmillRate: 0,
//           };
//         }

//         const g = grouped[key];

//         g.BaleCount += row.BaleNo ? 1 : 0;
//         g.SumCurrentWt += row.CurrentWt || 0;
//         g.SumAllowance += row.Allowance || 0;
//         g.SumTareWeight += row.TareWeight || 0;
//         g.SumSampleWeight += row.SampleWeight || 0;
//         g.TotalWeight += row.TotalWeight || 0;
//         g.ActGrossValue += row.ActGrossValue || 0;
//         g.NetRatePerKgTotal += row.NetRatePerKg || 0;
//         g.ExmillRateTotal += row.ExmillRate || 0;
//       });

//       // Post-processing: compute averages and percentages
//       Object.values(grouped).forEach((g) => {
//         g.NetWeight =
//           g.SumCurrentWt -
//           (g.SumAllowance + g.SumTareWeight + g.SumSampleWeight);

//         // base percent using RDLC-equivalent formula
//         let percent = 0;
//         if (g.TotalWeight && g.TotalWeight !== 0) {
//           percent = (g.NetWeight / g.TotalWeight) * 100;
//         }

//         // allow explicit override via query param ?percentMultiplier=10
//         const explicitMultiplier = paramData.percentMultiplier
//           ? Number(paramData.percentMultiplier)
//           : null;

//         if (
//           explicitMultiplier &&
//           !isNaN(explicitMultiplier) &&
//           explicitMultiplier > 0
//         ) {
//           percent = percent * explicitMultiplier;
//         } else {
//           // heuristic: if percent is suspiciously small (<1) but TotalWeight is >> SumCurrentWt,
//           // it's likely a units mismatch (e.g. TotalWeight in different base). Multiply by 10.
//           // You can change the conditions if you prefer a different heuristic.
//           const ratio =
//             g.TotalWeight && g.SumCurrentWt
//               ? g.TotalWeight / g.SumCurrentWt
//               : 0;
//           if (percent < 1 && ratio > 100) {
//             percent = percent * 10;
//           }
//         }

//         // round to 2 decimals
//         g.Percent = Math.round(percent * 100) / 100;

//         // Compute averages safely
//         g.AvgNetRatePerKg =
//           g.BaleCount && g.BaleCount != 0
//             ? (g.NetRatePerKgTotal / g.BaleCount).toFixed(2)
//             : "-";
//         g.AvgExmillRate =
//           g.BaleCount && g.BaleCount != 0
//             ? (g.ExmillRateTotal / g.BaleCount).toFixed(2)
//             : "-";

//         // Format values
//         g.ActGrossValue = g.ActGrossValue.toFixed(2);
//       });

//       data = Object.values(grouped);
//     }

//     // Return response
//     res.status(200).json({
//       totalRecords: data.length,
//       data: data,
//     });
//   } catch (err) {
//     console.error("Error in getCottonReports:", err);
//     res.status(500).json({ error: err.message });
//   }
// };


import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";

export const getCottonReports = async (req, res) => {
  try {
    const paramData = req.query;

    // Connect to the database
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    // 1. Create a request object
    const request = pool.request();

    // 2. Add BranchCode from header if it exists (Integer type)
    const bCode = req.headers['branchCode'] || req.headers['branchcode'];
    if (bCode) {
      request.input("BranchCode", sql.Int, parseInt(bCode));
    }

    // 3. Add existing query parameters
    request
      .input("FromDate", sql.DateTime, paramData?.fromDate)
      .input("ToDate", sql.DateTime, paramData?.toDate)
      .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode));

    let procedureName = "";

    // Determine which stored procedure to execute
    if (paramData.parentHeader === "cotton-po-report") {
      if (paramData.childHeader === "supplier-wise") {
        procedureName = "web_sp_CottonPurchaseOrder_GetAll";
      } else if (paramData.childHeader === "pendings") {
        procedureName = "web_sp_CottonPurchaseOrder_PendingDetails";
      }
    } else if (paramData.parentHeader === "cotton-weighment-report") {
      if (paramData.childHeader === "supplier-wise") {
        procedureName = "web_sp_CottonWeighment_GetAll";
      }
    } else if (paramData.parentHeader === "cotton-mixing-issue-report") {
      request.input("IssueType", sql.NVarChar(5), "ISSUE");
      if (paramData.childHeader === "count-wise") {
        procedureName = "web_sp_CottonIssueDetails_GetAll";
      }
    } else if (paramData.parentHeader === "cotton-stock-report") {
      if (paramData.childHeader === "variety-wise") {
        procedureName = "web_sp_Cotton_Stock";
      } else if (paramData.childHeader === "rm-type-wise") {
        procedureName = "web_sp_Cotton_Stock";
      }
    }

    if (!procedureName) {
      return res.status(400).json({ error: "Invalid report parameters" });
    }

    // Execute the stored procedure
    const result = await request.execute(procedureName);
    let data = result.recordset || [];
      console.log(data, 422323);
      
    // ✅ Count non-zero entries per VarietyName
    if (
      paramData.parentHeader === "cotton-stock-report" 
      &&
      paramData.childHeader === "variety-wise"
    ) {
      const grouped = {};

      data.forEach((row) => {
        const key = row.RawMaterialName || "UNKNOWN";
        if (!grouped[key]) {
          grouped[key] = {
            RawMaterialName: key,
            OpBales: 0,
            OPKgs: 0,
            ReceiptBales: 0,
            ReceiptKgs: 0,
            UnitReceiptBales: 0,
            UnitReceiptKgs: 0,
            IssueBales: 0,
            IssueKgs: 0,
            IssueKgs2: 0,
            IssueDifferent: 0,
            ClosingBales: 0,
            ClosingKgs: 0,
            TransBales: 0,
            TransKgs: 0,
            RejectBales: 0,
            RejectKgs: 0,
            SalesBales: 0,
            SalesKgs: 0,
            
          };
        }

        grouped[key].OpBales += row.OpBales && row.OpBales !== 0 ? row.OpBales : 0;
        grouped[key].ReceiptBales +=
          row.ReceiptBales && row.ReceiptBales !== 0 ? row.ReceiptBales : 0;
        grouped[key].UnitReceiptBales +=
          row.UnitReceiptBales && row.UnitReceiptBales !== 0 ? row.UnitReceiptBales : 0;
        grouped[key].IssueBales +=
          row.IssueBales && row.IssueBales !== 0 ? row.IssueBales : 0;
        grouped[key].ClosingBales +=
          row.ClosingBales && row.ClosingBales !== 0 ? row.ClosingBales : 0;
        grouped[key].TransBales += row.TransBales || 0;
        grouped[key].RejectBales += row.RejectBales || 0;
        grouped[key].SalesBales += row.SalesBales || 0;

        grouped[key].OPKgs += row.OPKgs || 0;
        grouped[key].TransKgs += row.TransKgs || 0;
        grouped[key].ReceiptKgs += row.ReceiptKgs || 0;
        grouped[key].UnitReceiptKgs += row.UnitReceiptKgs || 0;
        grouped[key].IssueKgs += row.IssueKgs || 0;
        grouped[key].IssueKgs2 += row.IssueKgs2 || 0;
        grouped[key].RejectKgs += row.RejectKgs || 0;
        grouped[key].SalesKgs += row.SalesKgs || 0;
        grouped[key].ClosingKgs += row.ClosingKgs || 0;
      });

      Object.values(grouped).forEach((g) => {
        // issueDifferent = issueKGS2 - issueKGS (compute before toFixed turns them into strings)
        g.IssueDifferent = g.IssueKgs2 - g.IssueKgs;

        g.OPKgs = Number(g.OPKgs.toFixed(2));
        g.TransKgs = Number(g.TransKgs.toFixed(2));
        g.ReceiptKgs = Number(g.ReceiptKgs.toFixed(2));
        g.UnitReceiptKgs = Number(g.UnitReceiptKgs.toFixed(2));
        g.IssueKgs = Number(g.IssueKgs.toFixed(2));
        g.IssueKgs2 = Number(g.IssueKgs2.toFixed(2));
        g.IssueDifferent = Number(g.IssueDifferent.toFixed(2));
        g.RejectKgs = Number(g.RejectKgs.toFixed(2));
        g.SalesKgs = Number(g.SalesKgs.toFixed(2));
        g.ClosingKgs = Number(g.ClosingKgs.toFixed(2));
      });

      data = Object.values(grouped);
    }

    // ✅ Special handling for "cotton-mixing-issue-report" > "count-wise"
    if (
      paramData.parentHeader === "cotton-mixing-issue-report" &&
      paramData.childHeader === "count-wise"
    ) {
      const grouped = {};

      data.forEach((row) => {
        const key = `${row.CottonCountCode || 0}_${row.RawMaterialCode || 0}`;
        if (!grouped[key]) {
          grouped[key] = {
            CottonCountCode: row.CottonCountCode,
            CottonCountName: row.CottonCountName,
            RawMaterialCode: row.RawMaterialCode,
            RawMaterialName: row.RawMaterialName,
            BaleCount: 0,
            SumCurrentWt: 0,
            SumAllowance: 0,
            SumTareWeight: 0,
            SumSampleWeight: 0,
            TotalWeight: 0,
            NetWeight: 0,
            Percent: 0,
            ActGrossValue: 0,
            NetRatePerKgTotal: 0,
            ExmillRateTotal: 0,
            AvgNetRatePerKg: 0,
            AvgExmillRate: 0,
          };
        }

        const g = grouped[key];
        g.BaleCount += row.BaleNo ? 1 : 0;
        g.SumCurrentWt += row.CurrentWt || 0;
        g.SumAllowance += row.Allowance || 0;
        g.SumTareWeight += row.TareWeight || 0;
        g.SumSampleWeight += row.SampleWeight || 0;
        g.TotalWeight += row.TotalWeight || 0;
        g.ActGrossValue += row.ActGrossValue || 0;
        g.NetRatePerKgTotal += row.NetRatePerKg || 0;
        g.ExmillRateTotal += row.ExmillRate || 0;
      });

      Object.values(grouped).forEach((g) => {
        g.NetWeight =
          g.SumCurrentWt -
          (g.SumAllowance + g.SumTareWeight + g.SumSampleWeight);

        let percent = 0;
        if (g.TotalWeight && g.TotalWeight !== 0) {
          percent = (g.NetWeight / g.TotalWeight) * 100;
        }

        const explicitMultiplier = paramData.percentMultiplier
          ? Number(paramData.percentMultiplier)
          : null;

        if (
          explicitMultiplier &&
          !isNaN(explicitMultiplier) &&
          explicitMultiplier > 0
        ) {
          percent = percent * explicitMultiplier;
        } else {
          const ratio =
            g.TotalWeight && g.SumCurrentWt
              ? g.TotalWeight / g.SumCurrentWt
              : 0;
          if (percent < 1 && ratio > 100) {
            percent = percent * 10;
          }
        }

        g.Percent = Math.round(percent * 100) / 100;

        g.AvgNetRatePerKg =
          g.BaleCount && g.BaleCount != 0
            ? (g.NetRatePerKgTotal / g.BaleCount).toFixed(2)
            : "-";
        g.AvgExmillRate =
          g.BaleCount && g.BaleCount != 0
            ? (g.ExmillRateTotal / g.BaleCount).toFixed(2)
            : "-";

        g.ActGrossValue = g.ActGrossValue.toFixed(2);
      });

      data = Object.values(grouped);
    }

    res.status(200).json({
      totalRecords: data.length,
      data: data,
    });
  } catch (err) {
    console.error("Error in getCottonReports:", err);
    res.status(500).json({ error: err.message });
  }
};