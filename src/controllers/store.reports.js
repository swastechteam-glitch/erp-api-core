// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const getStoreReports = async (req, res) => {
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
//     //STORE PURCHASE ORDER REPORT
//     if (paramData.parentHeader === "store-po-report") {
//       if (paramData.childHeader === "date-wise") {
//         procedureName = "web_sp_PurchaseOrderDetails_GetAll";
//       } else if (paramData.childHeader === "pendings") {
//         request.input("Pending", 1);
//         procedureName = "web_sp_RptPurchaseOrderDetailsPending";
//       }

//       //STORE INWARD REPORT
//     } else if (paramData.parentHeader === "store-inward-report") {
//       if (paramData.childHeader === "date-wise") {
//         request.input("InwardDateBased", 1);
//         request.input("Pending", 0);
//         request.input("WithImage", 0);
//         procedureName = "web_sp_RptPurchaseOrderReceivedDetails";
//       } else if (paramData.childHeader === "customer-wise") {
//         procedureName = "web_sp_InvoiceDetails_GetAll";
//       }
//     }

//     //STORE ISSUE REPORT
//     else if (paramData.parentHeader === "store-issue-report") {
//       if (paramData.childHeader === "date-wise") {
//         procedureName = "web_sp_IssueDetails_GetAll";
//       }
//     }

//     //STORE STOCK REPORT
//     else if (paramData.parentHeader === "store-stock-report") {
//       if (paramData.childHeader === "group-wise-value") {
//         request.input("ReceiptIssueBased", 0);
//         procedureName = "web_sp_Stock_Statement";
//       }
//     }

//     if (!procedureName) {
//       return res.status(400).json({ error: "Invalid report parameters" });
//     }

//     // Execute the stored procedure
//     const result = await request.execute(procedureName);
//     let data = result.recordset || [];

//     if (
//       paramData.parentHeader === "store-stock-report" &&
//       paramData.childHeader === "group-wise-value"
//     ) {
//       const grouped = {};

//       data.forEach((row) => {
//         // const key = row.ItemGroupCode || "UNKNOWN";
//         const key = `${row.ItemGroupCode || 0}_${row.ItemCategoryCode || 0}`;
//         if (!grouped[key]) {
//           grouped[key] = {
//             ItemGroupCode: row.ItemGroupCode,
//             ItemGroupName: row.ItemGroupName,
//             ItemCategoryCode: row.ItemCategoryCode,
//             ItemCategoryName: row.ItemCategoryName,
//             OpnValue: 0,
//             InValue: 0,
//             InwardReturnValue: 0,
//             OutwardValue: 0,
//             IssueReturnValue: 0,
//             InwAdjValue: 0,
//             RecAdjValue: 0,
//             ClosingValue: 0,
//           };
//         }

//         grouped[key].OpnValue += row.OpnValue || 0;
//         grouped[key].InValue += row.InValue || 0;
//         grouped[key].InwardReturnValue += row.InwardReturnValue || 0;
//         grouped[key].OutwardValue += row.OutwardValue || 0;
//         grouped[key].IssueReturnValue += row.IssueReturnValue || 0;
//         grouped[key].InwAdjValue += row.InwAdjValue || 0;
//         grouped[key].RecAdjValue += row.RecAdjValue || 0;
//         grouped[key].ClosingValue += row.ClosingValue || 0;
//       });

//       Object.values(grouped).forEach((g) => {
//         g.OpnValue = g.OpnValue.toFixed(2);
//         g.InValue = g.InValue.toFixed(2);
//         g.InwardReturnValue = g.InwardReturnValue.toFixed(2);
//         g.OutwardValue = g.OutwardValue.toFixed(2);
//         g.IssueReturnValue = g.IssueReturnValue.toFixed(2);
//         g.InwAdjValue = g.InwAdjValue.toFixed(2);
//         g.RecAdjValue = g.RecAdjValue.toFixed(2);
//         g.ClosingValue = g.ClosingValue.toFixed(2);
//       });

//       data = Object.values(grouped);
//     }

//     res.status(200).json({
//       totalRecords: data.length,
//       data: data,
//     });
//   } catch (err) {
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

export const getStoreReports = async (req, res) => {
  try {
    const paramData = req.query;

    // Connect to the database
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    
    // Create a request object
    const request = pool.request();

    // ✅ Fix: Add BranchCode from header if it exists
    applyBranchCode(request, req.headers);

    // Add standard inputs
    request
      .input("FromDate", sql.DateTime, paramData?.fromDate)
      .input("ToDate", sql.DateTime, paramData?.toDate)
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode));

    let procedureName = "";

    // Determine which stored procedure to execute
    // STORE PURCHASE ORDER REPORT
    if (paramData.parentHeader === "store-po-report") {
      if (paramData.childHeader === "date-wise") {
        procedureName = "web_sp_PurchaseOrderDetails_GetAll";
      } else if (paramData.childHeader === "pendings") {
        request.input("Pending", 1);
        procedureName = "web_sp_RptPurchaseOrderDetailsPending";
      }

      // STORE INWARD REPORT
    } else if (paramData.parentHeader === "store-inward-report") {
      if (paramData.childHeader === "date-wise") {
        request.input("InwardDateBased", 1);
        request.input("Pending", 0);
        request.input("WithImage", 0);
        procedureName = "web_sp_RptPurchaseOrderReceivedDetails";
      } else if (paramData.childHeader === "customer-wise") {
        procedureName = "web_sp_InvoiceDetails_GetAll";
      }
    }

    // STORE ISSUE REPORT
    else if (paramData.parentHeader === "store-issue-report") {
      if (
        paramData.childHeader === "date-wise" ||
        paramData.childHeader === "department-wise" ||
        paramData.childHeader === "item-wise" ||
        paramData.childHeader === "cost-head-wise" ||
        paramData.childHeader === "machine-wise"
      ) {
        procedureName = "web_sp_IssueDetails_GetAll";
      }
    }

    // STORE SERVICE ORDER COMPLETE REPORT
    else if (paramData.parentHeader === "store-service-order-complete-report") {
      if (
        paramData.childHeader === "material-date-wise" ||
        paramData.childHeader === "material-department-wise" ||
        paramData.childHeader === "visitors-date-wise" ||
        paramData.childHeader === "visitors-department-wise"
      ) {
        procedureName = "web_sp_ServiceOrderCompleteDetails_GetAll";
      }
    }

    // STORE COSTING REPORT
    else if (paramData.parentHeader === "store-costing-report") {
      if (
        paramData.childHeader === "category-wise" ||
        paramData.childHeader === "department-wise" ||
        paramData.childHeader === "item-wise" ||
        paramData.childHeader === "machine-wise"
      ) {
        procedureName = "web_sp_Store_Costing";
      }
    }

    // STORE STOCK REPORT
    else if (paramData.parentHeader === "store-stock-report") {
      if (
        paramData.childHeader === "group-wise-value" ||
        paramData.childHeader === "department-wise-value" ||
        paramData.childHeader === "department-wise-closing"
      ) {
        request.input("ReceiptIssueBased", 0);
        procedureName = "web_sp_Stock_Statement";
      }
    }

    if (!procedureName) {
      return res.status(400).json({ error: "Invalid report parameters" });
    }

    // Execute the stored procedure
    const result = await request.execute(procedureName);
    let data = result.recordset || [];

    if (
      paramData.parentHeader === "store-stock-report" &&
      paramData.childHeader === "group-wise-value"
    ) {
      const grouped = {};

      data.forEach((row) => {
        // Create a unique key based on Group and Category
        const key = `${row.ItemGroupCode || 0}_${row.ItemCategoryCode || 0}`;
        if (!grouped[key]) {
          grouped[key] = {
            ItemGroupCode: row.ItemGroupCode,
            ItemGroupName: row.ItemGroupName,
            ItemCategoryCode: row.ItemCategoryCode,
            ItemCategoryName: row.ItemCategoryName,
            OpnValue: 0,
            InValue: 0,
            InwardReturnValue: 0,
            OutwardValue: 0,
            IssueReturnValue: 0,
            InwAdjValue: 0,
            RecAdjValue: 0,
            ClosingValue: 0,
          };
        }

        grouped[key].OpnValue += row.OpnValue || 0;
        grouped[key].InValue += row.InValue || 0;
        grouped[key].InwardReturnValue += row.InwardReturnValue || 0;
        grouped[key].OutwardValue += row.OutwardValue || 0;
        grouped[key].IssueReturnValue += row.IssueReturnValue || 0;
        grouped[key].InwAdjValue += row.InwAdjValue || 0;
        grouped[key].RecAdjValue += row.RecAdjValue || 0;
        grouped[key].ClosingValue += row.ClosingValue || 0;
      });

      Object.values(grouped).forEach((g) => {
        g.OpnValue = g.OpnValue.toFixed(2);
        g.InValue = g.InValue.toFixed(2);
        g.InwardReturnValue = g.InwardReturnValue.toFixed(2);
        g.OutwardValue = g.OutwardValue.toFixed(2);
        g.IssueReturnValue = g.IssueReturnValue.toFixed(2);
        g.InwAdjValue = g.InwAdjValue.toFixed(2);
        g.RecAdjValue = g.RecAdjValue.toFixed(2);
        g.ClosingValue = g.ClosingValue.toFixed(2);
      });

      data = Object.values(grouped);
    }

    res.status(200).json({
      totalRecords: data.length,
      data: data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};