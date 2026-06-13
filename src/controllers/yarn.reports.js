// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const getyarnReports = async (req, res) => {
//   try {
//     const paramData = req.query;

//     // Connect to the database
//        if (!req.headers.subdbname)
//          return res
//            .status(400)
//            .json({ success: false, message: "Missing subDBName" });
   
//        const pool = await getPool(req.headers.subdbname);

//     // Create a request object
//     const request = pool.request()
//       .input("FromDate", sql.DateTime, paramData?.fromDate)
//       .input("ToDate", sql.DateTime, paramData?.toDate)
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode));

//     let procedureName = "";

//     // Determine which stored procedure to execute
//     //YARN SALES ORDER REPORT
//     if (paramData.parentHeader === 'yarn-sales-order-report') {
//       if (paramData.childHeader === 'date-wise') {
//         request.input("Web", 1)
//         procedureName = "web_sp_SalesOrderDetails_GetAll";

//       } else if (paramData.childHeader === 'customer-wise') {
//         request.input("Web", 1)
//         procedureName = "web_sp_SalesOrderDetails_GetAll";

//          } else if (paramData.childHeader === 'pendings') {
//         procedureName = "web_sp_Pending_InvoiceList_GetAll";
//       }
      
//       //YARN SALES INVOICE REPORT
//     } else if (paramData.parentHeader === 'yarn-sales-invoice-report') {
//       request.input("OrderBy", sql.NVarChar(8), "BillDate")
//       if (paramData.childHeader === 'date-wise') {
//         procedureName = "web_sp_InvoiceDetails_GetAll";

//         } else if (paramData.childHeader === 'customer-wise') {
//         procedureName = "web_sp_InvoiceDetails_GetAll";
//       }

//       //YARN PURCHASE ORDER REPORT
//     } else if (paramData.parentHeader === 'yarn-purchase-order-report') {
//       if (paramData.childHeader === 'date-wise') {
//         procedureName = "web_sp_YarnPurchaseOrder_GetAll";

//       } else if (paramData.childHeader === 'supplier-wise') {
//         procedureName = "web_sp_YarnPurchaseOrder_GetAll";
//       }
//     }

//     //YARN GRN REPORT
//     else if (paramData.parentHeader === 'yarn-grn-report') {
//       if (paramData.childHeader === 'date-wise') {
//         procedureName = "web_sp_YarnGRNDetails_GetAll";
//       } else if (paramData.childHeader === 'supplier-wise') {
//         procedureName = "web_sp_YarnGRNDetails_GetAll";
//       }
//     }

//     //YARN STOCK REPORT
//     else if (paramData.parentHeader === 'yarn-stock-report') {
//       if (paramData.childHeader === 'count-wise-qty-with-kgs') {
//         procedureName = "web_sp_StockStatement_Yarn";
//            }
//     }

//     if (!procedureName) {
//       return res.status(400).json({ error: "Invalid report parameters" });
//     }

//     // Execute the stored procedure
//     const result = await request.execute(procedureName);
//     let data = result.recordset || [];

//     // ✅ Count non-zero entries per GodownName
//     if (
//       paramData.parentHeader === "yarn-stock-report" &&
//       paramData.childHeader === "count-wise-qty-with-kgs"
//     ) {
//       const grouped = {};

//       data.forEach((row) => {
//         const key = row.CountTypeCode || 0;
//         if (!grouped[key]) {
//           grouped[key] = {
//             CountTypeCode: key,
//             CountType: row.CountType,
//             TipColour: row.TipColour,
//             BagColour: row.BagColour,
//             OpnQty: 0,
//             ProdnQty: 0,
//             PurQty: 0,
//             SalesReturnQty: 0,
//             SalesQty: 0,
//             ClQty: 0,
//             ClKgs: 0,
//           };
//         }

  
//         // ✅ Keep Kgs fields as total sums
//         grouped[key].OpnQty += row.OpnQty || 0;
//         grouped[key].ProdnQty += row.ProdnQty || 0;
//         grouped[key].PurQty += row.PurQty || 0;
//         grouped[key].SalesReturnQty += row.SalesReturnQty || 0;
//         grouped[key].SalesQty += row.SalesQty || 0;
//         grouped[key].ClQty += row.ClQty || 0;
//         grouped[key].ClKgs += row.ClKgs || 0;
//       });

//       Object.values(grouped).forEach((g) => {
//         g.OpnQty = g.OpnQty.toFixed(3);
//         g.ProdnQty = g.ProdnQty.toFixed(3);
//         g.PurQty = g.PurQty.toFixed(3);
//         g.SalesReturnQty = g.SalesReturnQty.toFixed(3);
//         g.SalesQty = g.SalesQty.toFixed(3);
//         g.ClQty = g.ClQty.toFixed(3);
//         g.ClKgs = g.ClKgs.toFixed(3);
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

export const getyarnReports = async (req, res) => {
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
    // YARN SALES ORDER REPORT
    if (paramData.parentHeader === "yarn-sales-order-report") {
      if (
        paramData.childHeader === "date-wise" ||
        paramData.childHeader === "customer-wise" ||
        paramData.childHeader === "agent-wise" ||
        paramData.childHeader === "count-wise"
      ) {
        request.input("Web", 1);
        procedureName = "web_sp_SalesOrderDetails_GetAll";
      } else if (paramData.childHeader === "pendings") {
        procedureName = "web_sp_Pending_InvoiceList_GetAll";
      }

      // YARN SALES INVOICE REPORT
    } else if (paramData.parentHeader === "yarn-sales-invoice-report") {
      request.input("OrderBy", sql.NVarChar(8), "BillDate");
      if (
        paramData.childHeader === "date-wise" ||
        paramData.childHeader === "customer-wise" ||
        paramData.childHeader === "agent-wise" ||
        paramData.childHeader === "count-wise" ||
        paramData.childHeader === "avgrate-count-wise"
      ) {
        procedureName = "web_sp_InvoiceDetails_GetAll";
      }

      // YARN PURCHASE ORDER REPORT
    } else if (paramData.parentHeader === "yarn-purchase-order-report") {
      if (
        paramData.childHeader === "date-wise" ||
        paramData.childHeader === "supplier-wise" ||
        paramData.childHeader === "count-wise"
      ) {
        procedureName = "web_sp_YarnPurchaseOrder_GetAll";
      }
    }

    // YARN GRN REPORT
    else if (paramData.parentHeader === "yarn-grn-report") {
      if (paramData.childHeader === "date-wise") {
        procedureName = "web_sp_YarnGRNDetails_GetAll";
      } else if (paramData.childHeader === "supplier-wise") {
        procedureName = "web_sp_YarnGRNDetails_GetAll";
      }
    }

    // YARN STOCK REPORT
    else if (paramData.parentHeader === "yarn-stock-report") {
      if (paramData.childHeader === "count-wise-qty-with-kgs") {
        procedureName = "web_sp_StockStatement_Yarn";
      }
    }

    if (!procedureName) {
      return res.status(400).json({ error: "Invalid report parameters" });
    }

    // Execute the stored procedure
    const result = await request.execute(procedureName);
    let data = result.recordset || [];

    // ✅ Count non-zero entries per CountTypeCode
    if (
      paramData.parentHeader === "yarn-stock-report" &&
      paramData.childHeader === "count-wise-qty-with-kgs"
    ) {
      const grouped = {};

      data.forEach((row) => {
        const key = row.CountTypeCode || 0;
        if (!grouped[key]) {
          grouped[key] = {
            CountTypeCode: key,
            CountType: row.CountType,
            TipColour: row.TipColour,
            BagColour: row.BagColour,
            OpnQty: 0,
            ProdnQty: 0,
            PurQty: 0,
            SalesReturnQty: 0,
            SalesQty: 0,
            ClQty: 0,
            ClKgs: 0,
          };
        }

        // ✅ Keep Kgs fields as total sums
        grouped[key].OpnQty += row.OpnQty || 0;
        grouped[key].ProdnQty += row.ProdnQty || 0;
        grouped[key].PurQty += row.PurQty || 0;
        grouped[key].SalesReturnQty += row.SalesReturnQty || 0;
        grouped[key].SalesQty += row.SalesQty || 0;
        grouped[key].ClQty += row.ClQty || 0;
        grouped[key].ClKgs += row.ClKgs || 0;
      });

      Object.values(grouped).forEach((g) => {
        g.OpnQty = g.OpnQty.toFixed(3);
        g.ProdnQty = g.ProdnQty.toFixed(3);
        g.PurQty = g.PurQty.toFixed(3);
        g.SalesReturnQty = g.SalesReturnQty.toFixed(3);
        g.SalesQty = g.SalesQty.toFixed(3);
        g.ClQty = g.ClQty.toFixed(3);
        g.ClKgs = g.ClKgs.toFixed(3);
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

