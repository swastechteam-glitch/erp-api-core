// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";
// import { log } from "console";
// import { dMY } from "../utils/common.js";

// // Pre Costing Calculation formula
// export const preCostingCalculations = async (req, res) => {
//   try {
//     const bodyData = req.body; // shortcut

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("FWPACode", sql.Int, 1)
//       .execute("sp_FrameWiseProfitAnalyse_GetAll");

//     // convert empty/undefined to number 0
//     const V = (v) => Number(v ?? 0);

//     // -----------------------------
//     // COMMON CALCULATION
//     // -----------------------------
//     const ProdnPerFramePerDay =
//       (V(bodyData.SplPerFrame) * V(bodyData.GMSPerSpl) * 3) / 1000;

//     let CleanCottonCost = 0;
//     let PowerConsumed = 0;
//     let WagesAndSalaries = 0;
//     let Stores = 0;
//     let PackingMaterial = 0;
//     let RepairAndMaintenance = 0;
//     let Administration = 0;
//     let InterestOnTermLoan = 0;
//     let InterestOnWorkingCapital = 0;
//     let Commission = 0;
//     let RePayment = 0;
//     let TotalCost = 0;
//     let ComberWasteSales = 0;
//     let CardingWasteSales = 0;
//     let TotalCostPerKG = 0;
//     let Profit = 0;
//     let ProfitPerFramePerDay = 0;

//     // ============================================================
//     //  PROCESS TYPE : CARDED
//     // ============================================================
//     if (bodyData.ProcessType === "CARDED") {
//       CleanCottonCost = round(
//         (V(bodyData.CottonCost) / (100 - V(bodyData.CardingWastePer))) * 100,
//       );

//       PowerConsumed = round(
//         V(result.recordset?.[0]?.Crd_PowerConsumed) * V(bodyData.UKG),
//       );

//       WagesAndSalaries = round(
//         (V(result.recordset?.[0]?.Crd_Wages) *
//           V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       Stores = round(
//         (V(result.recordset?.[0]?.Crd_Stores) *
//           V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       PackingMaterial = V(result.recordset?.[0]?.Crd_Packing);

//       RepairAndMaintenance = round(
//         (V(result.recordset?.[0]?.Crd_Repair) *
//           V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       Administration = round(
//         (V(result.recordset?.[0]?.Crd_Admin) *
//           V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       InterestOnTermLoan = round(
//         (V(result.recordset?.[0]?.Crd_InterestOnTermLoan) *
//           V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       InterestOnWorkingCapital = round(
//         (V(result.recordset?.[0]?.Crd_InterestOnworkingCapital) *
//           V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       Commission = round(
//         (V(bodyData.SellingRate) *
//           V(result.recordset?.[0]?.Crd_CommissionPer)) /
//           100,
//       );

//       RePayment = round(
//         (V(result.recordset?.[0]?.Crd_Repayment) *
//           V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       TotalCost = round(
//         CleanCottonCost +
//           PowerConsumed +
//           WagesAndSalaries +
//           Stores +
//           PackingMaterial +
//           RepairAndMaintenance +
//           Administration +
//           InterestOnTermLoan +
//           InterestOnWorkingCapital +
//           Commission +
//           RePayment,
//       );

//       ComberWasteSales = 0;

//       CardingWasteSales = round(
//         ((1 / (100 - V(bodyData.CardingWastePer))) * 100 - 1) *
//           V(result.recordset?.[0]?.Crd_CardingWasteRate),
//       );

//       TotalCostPerKG = round(TotalCost - CardingWasteSales - ComberWasteSales);

//       Profit = round(V(bodyData.SellingRate) - TotalCostPerKG);

//       ProfitPerFramePerDay = round(Profit * ProdnPerFramePerDay);
//     }

//     // ============================================================
//     //  PROCESS TYPE : COMBED
//     // ============================================================
//     else if (bodyData.ProcessType === "COMBED") {
//       CleanCottonCost = round(
//         (((V(bodyData.CottonCost) / (100 - V(bodyData.CardingWastePer))) *
//           100) /
//           (100 - V(bodyData.ComberWastePer))) *
//           100,
//       );

//       PowerConsumed = round(
//         V(result.recordset?.[0]?.Cmd_PowerConsumed) * V(bodyData.UKG),
//       );

//       WagesAndSalaries = round(
//         (V(result.recordset?.[0]?.Cmd_Wages) *
//           V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       Stores = round(
//         (V(result.recordset?.[0]?.Cmd_Stores) *
//           V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       PackingMaterial = V(result.recordset?.[0]?.Cmd_Packing);

//       RepairAndMaintenance = round(
//         (V(result.recordset?.[0]?.Cmd_Repair) *
//           V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       Administration = round(
//         (V(result.recordset?.[0]?.Cmd_Admin) *
//           V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       InterestOnTermLoan = round(
//         (V(result.recordset?.[0]?.Cmd_InterestOnTermLoan) *
//           V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       InterestOnWorkingCapital = round(
//         (V(result.recordset?.[0]?.Cmd_InterestOnworkingCapital) *
//           V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       Commission = round(
//         (V(bodyData.SellingRate) *
//           V(result.recordset?.[0]?.Cmd_CommissionPer)) /
//           100,
//       );

//       RePayment = round(
//         (V(result.recordset?.[0]?.Cmd_Repayment) *
//           V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
//           V(bodyData.GMSPerSpl),
//       );

//       TotalCost = round(
//         CleanCottonCost +
//           PowerConsumed +
//           WagesAndSalaries +
//           Stores +
//           PackingMaterial +
//           RepairAndMaintenance +
//           Administration +
//           InterestOnTermLoan +
//           InterestOnWorkingCapital +
//           Commission +
//           RePayment,
//       );

//       ComberWasteSales = round(
//         ((1 / (100 - V(bodyData.ComberWastePer))) * 100 - 1) *
//           V(result.recordset?.[0]?.Cmd_ComberWasteRate),
//       );

//       CardingWasteSales = round(
//         (((1 / (100 - V(bodyData.CardingWastePer))) * 100 - 1) /
//           (100 - V(bodyData.ComberWastePer))) *
//           100 *
//           V(result.recordset?.[0]?.Crd_CardingWasteRate),
//       );

//       TotalCostPerKG = round(TotalCost - CardingWasteSales - ComberWasteSales);

//       Profit = round(V(bodyData.SellingRate) - TotalCostPerKG);

//       ProfitPerFramePerDay = round(Profit * ProdnPerFramePerDay);
//     }

//     return res.json({
//       success: true,
//       data: {
//         ProdnPerFramePerDay,
//         CleanCottonCost,
//         PowerConsumed,
//         WagesAndSalaries,
//         Stores,
//         PackingMaterial,
//         RepairAndMaintenance,
//         Administration,
//         InterestOnTermLoan,
//         InterestOnWorkingCapital,
//         Commission,
//         RePayment,
//         TotalCost,
//         ComberWasteSales,
//         CardingWasteSales,
//         TotalCostPerKG,
//         Profit,
//         ProfitPerFramePerDay,
//       },
//     });
//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// // rounding helper
// function round(x) {
//   return Math.round((Number(x) + Number.EPSILON) * 100) / 100;
// }

// // Get List
// //1st Page Dashboard Data
// export const getDashboard = async (req, res) => {
//   try {
//     const paramData = req.query;
//     console.log(req.headers.branchCode, 11223333);

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });
//     console.log(paramData, 'paramData 34343');

//     const pool = await getPool(req.headers.subdbname);

//     const request = pool.request();

//     // ✅ Add BranchCode ONLY if it exists
//     if (req.headers.branchCode !== null && req.headers.branchCode !== "") {
//       request.input(
//         "BranchCode",
//         sql.Int,
//         parseInt(req.headers.branchCode)
//       );
//     }

//     const result = await request.execute("sp_DashBoard_GetSummary");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getLastSync = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_Update_LastSync_Scheduler");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// //2nd Page Dashboard Data

// export const getPreCostingCount = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .query("SELECT * FROM vw_FrameWiseProfitAnalyseDetails");

//     let avgRate = await pool.request().query("web_sp_Cotton_Purchase_AvgRate");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: { data: result.recordset, avgRate: avgRate.recordset },
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getOverAllCosting = async (req, res) => {
//   try {
//     const paramData = req.query;
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("FromDate", sql.DateTime, paramData?.fromDate)
//       .input("ToDate", sql.DateTime, paramData?.toDate)
//       .execute("sp_Costing");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getgraphView = async (req, res) => {
//   try {
//     if (!req.headers.subdbname) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing subDBName",
//       });
//     }

//     const pool = await getPool(req.headers.subdbname);
//     const result = await pool
//       .request()
//       .execute("web_sp_DashBoard_AllModules_Graph");

//     const output = {};

//     result.recordset.forEach((row) => {
//       const moduleKey = row.Module.toLowerCase(); // cotton, yarn
//       const viewKey = row.ViewType === "WEEK" ? "weekly" : "monthly";

//       if (!output[moduleKey]) {
//         output[moduleKey] = {
//           weekly: [],
//           monthly: [],
//         };
//       }

//       output[moduleKey][viewKey].push({
//         label: row.Label,
//         metric1Value: Number(row.Metric1Value) || 0,
//         metric2Value: Number(row.Metric2Value) || 0,
//       });
//     });

//     return res.status(200).json({
//       success: true,
//       data: output,
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({
//       success: false,
//       error: err.message,
//     });
//   }
// };

// export const getCottonPurchase = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_CottonPurchase_RawMaterialWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getCottonGRN = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_CottonArrival_RawMaterialWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getCottonIssue = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_CottonIssue_RawMaterialWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getCottonStock = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_CottonStock_RawMaterialWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getYarnProduction = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_YarnProdn_CountWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getYarnSalesOrder = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_YarnSO_CountWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getYarnSales = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_YarnSales_CountWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getYarnStock = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_YarnStock_CountWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getWasteProduction = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_WasteProdn_WasteItemWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getWasteSales = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_WasteSales_CountWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getWasteStock = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_WasteStock_WasteItemWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getStorePurchase = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_StoreGRN_DepartmentWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getStoreIssue = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_StoreIssue_DepartmentWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getStoreStock = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("PackingStock", sql.Int, parseInt(paramId?.packingStock))
//       .execute("web_sp_DashBoard_StoreStock_DepartmentWise");

//     res.status(200).json({
//       totalRecords: result.recordsets.length,
//       data: result.recordsets?.[0],
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getMechanicalScheduled = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_Mechanical_DepartmentWise");

//     res.status(200).json({
//       totalRecords: result.recordsets.length,
//       data: result.recordsets?.[0],
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getMechanicalPendings = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_Mechanical_DepartmentWise_Pendings");

//     res.status(200).json({
//       totalRecords: result.recordsets.length,
//       data: result.recordsets?.[0],
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getElectricalScheduled = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_Electrical_DepartmentWise");

//     res.status(200).json({
//       totalRecords: result.recordsets.length,
//       data: result.recordsets?.[0],
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getElectricalPendings = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_Electrical_DepartmentWise_Pendings");

//     res.status(200).json({
//       totalRecords: result.recordsets.length,
//       data: result.recordsets?.[0],
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// //3rd Page Dashboard Data

// export const getCottonPurchaseOrderDetails = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("RawMaterialCode", sql.Int, parseInt(paramId?.id))
//       .input("ToDay", sql.Bit, parseInt(paramId?.today))
//       .execute("web_sp_DashBoard_CottonPurchase_Details");

//     // Format the dates
//     const formattedData = result.recordset.map((row) => {
//       return {
//         ...row,
//         CPODate: dMY(row.CPODate),
//       };
//     });

//     res.status(200).json({
//       totalRecords: result.recordset?.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getCottonGRNDetails = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("RawMaterialCode", sql.Int, parseInt(paramId?.id))
//       .input("ToDay", sql.Bit, parseInt(paramId?.today))
//       .execute("web_sp_DashBoard_CottonArrival_Details");

//     // Format the dates
//     const formattedData = result.recordset.map((row) => {
//       return {
//         ...row,
//         ArrivalDate: dMY(row.ArrivalDate),
//       };
//     });

//     res.status(200).json({
//       totalRecords: result.recordset?.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getCottonIssueDetails = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("RawMaterialCode", sql.Int, parseInt(paramId?.id))
//       .input("ToDay", sql.Bit, parseInt(paramId?.today))
//       .execute("web_sp_DashBoard_CottonIssue_Details");

//     res.status(200).json({
//       totalRecords: result?.recordset?.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getYarnSalesOrderDetails = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("CountTypeCode", sql.Int, parseInt(paramId?.id))
//       .input("ToDay", sql.Bit, parseInt(paramId?.today))
//       .execute("web_sp_DashBoard_YarnSO_Details");

//     const formattedData = result.recordset.map((row) => {
//       return {
//         ...row,
//         SODate: dMY(row.SODate),
//       };
//     });

//     res.status(200).json({
//       totalRecords: result.recordset?.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getYarnSalesDetails = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("CountTypeCode", sql.Int, parseInt(paramId?.id))
//       .input("ToDay", sql.Bit, parseInt(paramId?.today))
//       .execute("web_sp_DashBoard_YarnSales_Details");

//     const formattedData = result.recordset.map((row) => {
//       return {
//         ...row,
//         SODate: dMY(row.SODate),
//       };
//     });

//     res.status(200).json({
//       totalRecords: result.recordset?.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getWasteSalesDetails = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("WasteItemCode", sql.Int, parseInt(paramId?.id))
//       .input("ToDay", sql.Bit, parseInt(paramId?.today))
//       .execute("web_sp_DashBoard_WasteSales_Details");

//     const formattedData = result.recordset.map((row) => {
//       return {
//         ...row,
//         WasteInvoiceDate: dMY(row.WasteInvoiceDate),
//       };
//     });

//     res.status(200).json({
//       totalRecords: result.recordset?.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getStorePurchaseDetails = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
//       .input("ToDay", sql.Bit, parseInt(paramId?.today))
//       .execute("web_sp_DashBoard_StoreGRN_Details");

//     const formattedData = result.recordset.map((row) => {
//       return {
//         ...row,
//         PurchaseOrderReceivedDate: dMY(row.PurchaseOrderReceivedDate),
//       };
//     });

//     res.status(200).json({
//       totalRecords: result.recordset?.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getStoreIssueDetails = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
//       .input("ToDay", sql.Bit, parseInt(paramId?.today))
//       .execute("web_sp_DashBoard_StoreIssue_Details");

//     const formattedData = result.recordset.map((row) => {
//       return {
//         ...row,
//         IssueDate: dMY(row.IssueDate),
//       };
//     });

//     res.status(200).json({
//       totalRecords: result.recordset?.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getMechanicalScheduledDetails = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
//       .input("ToDay", sql.Bit, parseInt(paramId?.today))
//       .execute("web_sp_DashBoard_Mechanical_Details");

//     const formattedData = result.recordset.map((row) => {
//       return {
//         ...row,
//         LastMaintenanceDate: dMY(row.LastMaintenanceDate),
//         NextServiceDate: dMY(row.NextServiceDate),
//       };
//     });

//     res.status(200).json({
//       totalRecords: result.recordset?.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getMechanicalPendingsDetails = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
//       .input("ToDay", sql.Bit, parseInt(paramId?.today))
//       .execute("web_sp_DashBoard_Mechanical_Pendings_Details");

//     const formattedData = result.recordset.map((row) => {
//       return {
//         ...row,
//         LastMaintenanceDate: dMY(row.LastMaintenanceDate),
//         NextServiceDate: dMY(row.NextServiceDate),
//       };
//     });

//     res.status(200).json({
//       totalRecords: result.recordset?.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getElectricalScheduledDetails = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
//       .input("ToDay", sql.Bit, parseInt(paramId?.today))
//       .execute("web_sp_DashBoard_Electrical_Details");

//     const formattedData = result.recordset.map((row) => {
//       return {
//         ...row,
//         LastMaintenanceDate: dMY(row.LastMaintenanceDate),
//         NextServiceDate: dMY(row.NextServiceDate),
//       };
//     });

//     res.status(200).json({
//       totalRecords: result.recordset?.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getElectricalPendingsDetails = async (req, res) => {
//   try {
//     const paramId = req.params;

//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
//       .input("ToDay", sql.Bit, parseInt(paramId?.today))
//       .execute("web_sp_DashBoard_Electrical_Pendings_Details");

//     const formattedData = result.recordset.map((row) => {
//       return {
//         ...row,
//         LastMaintenanceDate: dMY(row.LastMaintenanceDate),
//         NextServiceDate: dMY(row.NextServiceDate),
//       };
//     });

//     res.status(200).json({
//       totalRecords: result.recordset?.length,
//       data: formattedData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // 37 Functions





import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { log } from "console";
import { applyBranchCode, dMY } from "../utils/common.js";

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

// Pre Costing Calculation formula
export const preCostingCalculations = async (req, res) => {
  try {
    const bodyData = req.body; // shortcut

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("FWPACode", sql.Int, 1)
      .execute("sp_FrameWiseProfitAnalyse_GetAll");

    // convert empty/undefined to number 0
    const V = (v) => Number(v ?? 0);

    // -----------------------------
    // COMMON CALCULATION
    // -----------------------------
    const ProdnPerFramePerDay =
      (V(bodyData.SplPerFrame) * V(bodyData.GMSPerSpl) * 3) / 1000;

    let CleanCottonCost = 0;
    let PowerConsumed = 0;
    let WagesAndSalaries = 0;
    let Stores = 0;
    let PackingMaterial = 0;
    let RepairAndMaintenance = 0;
    let Administration = 0;
    let InterestOnTermLoan = 0;
    let InterestOnWorkingCapital = 0;
    let Commission = 0;
    let RePayment = 0;
    let TotalCost = 0;
    let ComberWasteSales = 0;
    let CardingWasteSales = 0;
    let TotalCostPerKG = 0;
    let Profit = 0;
    let ProfitPerFramePerDay = 0;

    // ============================================================
    //  PROCESS TYPE : CARDED
    // ============================================================
    if (bodyData.ProcessType === "CARDED") {
      CleanCottonCost = round(
        (V(bodyData.CottonCost) / (100 - V(bodyData.CardingWastePer))) * 100,
      );

      PowerConsumed = round(
        V(result.recordset?.[0]?.Crd_PowerConsumed) * V(bodyData.UKG),
      );

      WagesAndSalaries = round(
        (V(result.recordset?.[0]?.Crd_Wages) *
          V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      Stores = round(
        (V(result.recordset?.[0]?.Crd_Stores) *
          V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      PackingMaterial = V(result.recordset?.[0]?.Crd_Packing);

      RepairAndMaintenance = round(
        (V(result.recordset?.[0]?.Crd_Repair) *
          V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      Administration = round(
        (V(result.recordset?.[0]?.Crd_Admin) *
          V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      InterestOnTermLoan = round(
        (V(result.recordset?.[0]?.Crd_InterestOnTermLoan) *
          V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      InterestOnWorkingCapital = round(
        (V(result.recordset?.[0]?.Crd_InterestOnworkingCapital) *
          V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      Commission = round(
        (V(bodyData.SellingRate) *
          V(result.recordset?.[0]?.Crd_CommissionPer)) /
          100,
      );

      RePayment = round(
        (V(result.recordset?.[0]?.Crd_Repayment) *
          V(result.recordset?.[0]?.Crd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      TotalCost = round(
        CleanCottonCost +
          PowerConsumed +
          WagesAndSalaries +
          Stores +
          PackingMaterial +
          RepairAndMaintenance +
          Administration +
          InterestOnTermLoan +
          InterestOnWorkingCapital +
          Commission +
          RePayment,
      );

      ComberWasteSales = 0;

      CardingWasteSales = round(
        ((1 / (100 - V(bodyData.CardingWastePer))) * 100 - 1) *
          V(result.recordset?.[0]?.Crd_CardingWasteRate),
      );

      TotalCostPerKG = round(TotalCost - CardingWasteSales - ComberWasteSales);

      Profit = round(V(bodyData.SellingRate) - TotalCostPerKG);

      ProfitPerFramePerDay = round(Profit * ProdnPerFramePerDay);
    }

    // ============================================================
    //  PROCESS TYPE : COMBED
    // ============================================================
    else if (bodyData.ProcessType === "COMBED") {
      CleanCottonCost = round(
        (((V(bodyData.CottonCost) / (100 - V(bodyData.CardingWastePer))) *
          100) /
          (100 - V(bodyData.ComberWastePer))) *
          100,
      );

      PowerConsumed = round(
        V(result.recordset?.[0]?.Cmd_PowerConsumed) * V(bodyData.UKG),
      );

      WagesAndSalaries = round(
        (V(result.recordset?.[0]?.Cmd_Wages) *
          V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      Stores = round(
        (V(result.recordset?.[0]?.Cmd_Stores) *
          V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      PackingMaterial = V(result.recordset?.[0]?.Cmd_Packing);

      RepairAndMaintenance = round(
        (V(result.recordset?.[0]?.Cmd_Repair) *
          V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      Administration = round(
        (V(result.recordset?.[0]?.Cmd_Admin) *
          V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      InterestOnTermLoan = round(
        (V(result.recordset?.[0]?.Cmd_InterestOnTermLoan) *
          V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      InterestOnWorkingCapital = round(
        (V(result.recordset?.[0]?.Cmd_InterestOnworkingCapital) *
          V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      Commission = round(
        (V(bodyData.SellingRate) *
          V(result.recordset?.[0]?.Cmd_CommissionPer)) /
          100,
      );

      RePayment = round(
        (V(result.recordset?.[0]?.Cmd_Repayment) *
          V(result.recordset?.[0]?.Cmd_GMSPerSpl)) /
          V(bodyData.GMSPerSpl),
      );

      TotalCost = round(
        CleanCottonCost +
          PowerConsumed +
          WagesAndSalaries +
          Stores +
          PackingMaterial +
          RepairAndMaintenance +
          Administration +
          InterestOnTermLoan +
          InterestOnWorkingCapital +
          Commission +
          RePayment,
      );

      ComberWasteSales = round(
        ((1 / (100 - V(bodyData.ComberWastePer))) * 100 - 1) *
          V(result.recordset?.[0]?.Cmd_ComberWasteRate),
      );

      CardingWasteSales = round(
        (((1 / (100 - V(bodyData.CardingWastePer))) * 100 - 1) /
          (100 - V(bodyData.ComberWastePer))) *
          100 *
          V(result.recordset?.[0]?.Crd_CardingWasteRate),
      );

      TotalCostPerKG = round(TotalCost - CardingWasteSales - ComberWasteSales);

      Profit = round(V(bodyData.SellingRate) - TotalCostPerKG);

      ProfitPerFramePerDay = round(Profit * ProdnPerFramePerDay);
    }

    return res.json({
      success: true,
      data: {
        ProdnPerFramePerDay,
        CleanCottonCost,
        PowerConsumed,
        WagesAndSalaries,
        Stores,
        PackingMaterial,
        RepairAndMaintenance,
        Administration,
        InterestOnTermLoan,
        InterestOnWorkingCapital,
        Commission,
        RePayment,
        TotalCost,
        ComberWasteSales,
        CardingWasteSales,
        TotalCostPerKG,
        Profit,
        ProfitPerFramePerDay,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// rounding helper
function round(x) {
  return Math.round((Number(x) + Number.EPSILON) * 100) / 100;
}

// Get List
//1st Page Dashboard Data
export const getDashboard = async (req, res) => {
  try {
    const paramData = req.query;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode using helper
    applyBranchCode(request, req.headers);

    const result = await request.execute("sp_DashBoard_GetSummary");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getLastSync = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    // applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_Update_LastSync_Scheduler",
    );

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

//2nd Page Dashboard Data

export const getPreCostingCount = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request1 = pool.request();
    const request2 = pool.request();

    applyBranchCode(request1, req.headers);
    applyBranchCode(request2, req.headers);

    let query = "SELECT * FROM vw_FrameWiseProfitAnalyseDetails";
    // Check if branchCode exists for Query Logic
    if (req.headers["branchCode"] || req.headers["branchcode"]) {
      query += " WHERE BranchCode = @BranchCode";
    }

    let result = await request1.query(query);
    let avgRate = await request2.execute("web_sp_Cotton_Purchase_AvgRate");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: { data: result.recordset, avgRate: avgRate.recordset },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getOverAllCosting = async (req, res) => {
  try {
    const paramData = req.query;
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("FromDate", sql.DateTime, paramData?.fromDate)
      .input("ToDate", sql.DateTime, paramData?.toDate)
      .execute("sp_Costing");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getgraphView = async (req, res) => {
  try {
    if (!req.headers.subdbname) {
      return res.status(400).json({
        success: false,
        message: "Missing subDBName",
      });
    }

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    const result = await request.execute("web_sp_DashBoard_AllModules_Graph");

    const output = {};

    result.recordset.forEach((row) => {
      const moduleKey = row.Module.toLowerCase(); // cotton, yarn
      const viewKey = row.ViewType === "WEEK" ? "weekly" : "monthly";

      if (!output[moduleKey]) {
        output[moduleKey] = {
          weekly: [],
          monthly: [],
        };
      }

      output[moduleKey][viewKey].push({
        label: row.Label,
        metric1Value: Number(row.Metric1Value) || 0,
        metric2Value: Number(row.Metric2Value) || 0,
      });
    });

    return res.status(200).json({
      success: true,
      data: output,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const getCottonPurchase = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_CottonPurchase_RawMaterialWise",
    );

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCottonGRN = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_CottonArrival_RawMaterialWise",
    );

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCottonIssue = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_CottonIssue_RawMaterialWise",
    );

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCottonStock = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_CottonStock_RawMaterialWise",
    );

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// export const getYarnProduction = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool
//       .request()
//       .execute("web_sp_DashBoard_YarnProdn_CountWise");

//     res.status(200).json({
//       totalRecords: result.recordset.length,
//       data: result.recordset,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

export const getYarnProduction = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute("web_sp_DashBoard_YarnProdn_CountWise");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getYarnSalesOrder = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute("web_sp_DashBoard_YarnSO_CountWise");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getYarnSales = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute("web_sp_DashBoard_YarnSales_CountWise");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getYarnStock = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute("web_sp_DashBoard_YarnStock_CountWise");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getWasteProduction = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_WasteProdn_WasteItemWise",
    );

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getWasteSales = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute("web_sp_DashBoard_WasteSales_CountWise");

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getWasteStock = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_WasteStock_WasteItemWise",
    );

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getStorePurchase = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_StoreGRN_DepartmentWise",
    );

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getStoreIssue = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_StoreIssue_DepartmentWise",
    );

    res.status(200).json({
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getStoreStock = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    let result = await request
      .input("PackingStock", sql.Int, parseInt(paramId?.packingStock))
      .execute("web_sp_DashBoard_StoreStock_DepartmentWise");

    res.status(200).json({
      totalRecords: result.recordsets.length,
      data: result.recordsets?.[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMechanicalScheduled = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_Mechanical_DepartmentWise",
    );

    res.status(200).json({
      totalRecords: result.recordsets.length,
      data: result.recordsets?.[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


export const getDashboardPayrollSalaryDeptWise = async (req, res) => {
  try {
    // 1. Validate the subdbname header
    if (!req.headers.subdbname) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing subDBName" 
      });
    }

    // 2. Get DB Pool
    const pool = await getPool(req.headers.subdbname);
    const request = new sql.Request(pool);

    // 3. Apply standard header parameters (CompanyCode, BranchCode, etc.)
    applyBranchCode(request, req.headers);

    // 4. Execute the Stored Procedure
    const result = await request.execute("web_sp_DashBoard_PayrollSalary_DepartmentWise");

    // 5. Return the result
    return res.status(200).json({
      success: true,
      data: result.recordset || [],
      message: "Department-wise payroll salary fetched successfully!",
    });

  } catch (err) {
    console.error("Error fetching Department-wise Payroll Salary:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch payroll salary data.",
    });
  }
};

export const getDashboardPayrollOTSalaryDeptWise = async (req, res) => {
  try {
    // 1. Validate the subdbname header
    if (!req.headers.subdbname) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing subDBName" 
      });
    }

    // 2. Get DB Pool
    const pool = await getPool(req.headers.subdbname);
    const request = new sql.Request(pool);

    // 3. Apply standard header parameters (CompanyCode, BranchCode, etc.)
    applyBranchCode(request, req.headers);

    // 4. Execute the Stored Procedure
    const result = await request.execute("web_sp_DashBoard_PayrollOTSalary_DepartmentWise");

    // 5. Return the result
    return res.status(200).json({
      success: true,
      data: result.recordset || [],
      message: "Department-wise payroll OT salary fetched successfully!",
    });

  } catch (err) {
    console.error("Error fetching Department-wise Payroll OT Salary:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch payroll OT salary data.",
    });
  }
};

export const getDashboardPayrollStrengthDeptWise = async (req, res) => {
  try {
    // 1. Validate the subdbname header
    if (!req.headers.subdbname) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing subDBName" 
      });
    }

    // 2. Get DB Pool
    const pool = await getPool(req.headers.subdbname);
    const request = new sql.Request(pool);

    // 3. Apply standard header parameters (CompanyCode, BranchCode, etc.)
    applyBranchCode(request, req.headers);

    // 4. Execute the Stored Procedure
    const result = await request.execute("web_sp_DashBoard_PayrollStrength_DepartmentWise");

    // 5. Return the result
    return res.status(200).json({
      success: true,
      data: result.recordset || [],
      message: "Department-wise payroll OT salary fetched successfully!",
    });

  } catch (err) {
    console.error("Error fetching Department-wise Payroll OT Salary:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch payroll OT salary data.",
    });
  }
};

export const getMechanicalPendings = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_Mechanical_DepartmentWise_Pendings",
    );

    res.status(200).json({
      totalRecords: result.recordsets.length,
      data: result.recordsets?.[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getElectricalScheduled = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_Electrical_DepartmentWise",
    );

    res.status(200).json({
      totalRecords: result.recordsets.length,
      data: result.recordsets?.[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getElectricalPendings = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request.execute(
      "web_sp_DashBoard_Electrical_DepartmentWise_Pendings",
    );

    res.status(200).json({
      totalRecords: result.recordsets.length,
      data: result.recordsets?.[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

//3rd Page Dashboard Data

export const getCottonPurchaseOrderDetails = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("RawMaterialCode", sql.Int, parseInt(paramId?.id))
      .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_CottonPurchase_Details");

    // Format the dates
    const formattedData = result.recordset.map((row) => {
      return {
        ...row,
        CPODate: dMY(row.CPODate),
      };
    });

    res.status(200).json({
      totalRecords: result.recordset?.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCottonGRNDetails = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("RawMaterialCode", sql.Int, parseInt(paramId?.id))
      .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_CottonArrival_Details");

    // Format the dates
    const formattedData = result.recordset.map((row) => {
      return {
        ...row,
        ArrivalDate: dMY(row.ArrivalDate),
      };
    });

    res.status(200).json({
      totalRecords: result.recordset?.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCottonIssueDetails = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("RawMaterialCode", sql.Int, parseInt(paramId?.id))
      .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_CottonIssue_Details");

    res.status(200).json({
      totalRecords: result?.recordset?.length,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getYarnSalesOrderDetails = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    // applyBranchCode(request, req.headers);

    let result = await request
      .input("CountTypeCode", sql.Int, parseInt(paramId?.id))
      .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_YarnSO_Details");

    const formattedData = result.recordset.map((row) => {
      return {
        ...row,
        SODate: dMY(row.SODate),
      };
    });

    res.status(200).json({
      totalRecords: result.recordset?.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getYarnSalesDetails = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("CountTypeCode", sql.Int, parseInt(paramId?.id))
      .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_YarnSales_Details");

    const formattedData = result.recordset.map((row) => {
      return {
        ...row,
        SODate: dMY(row.SODate),
      };
    });

    res.status(200).json({
      totalRecords: result.recordset?.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getWasteSalesDetails = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("WasteItemCode", sql.Int, parseInt(paramId?.id))
      .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_WasteSales_Details");

    const formattedData = result.recordset.map((row) => {
      return {
        ...row,
        WasteInvoiceDate: dMY(row.WasteInvoiceDate),
      };
    });

    res.status(200).json({
      totalRecords: result.recordset?.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getStorePurchaseDetails = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
      .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_StoreGRN_Details");

    const formattedData = result.recordset.map((row) => {
      return {
        ...row,
        PurchaseOrderReceivedDate: dMY(row.PurchaseOrderReceivedDate),
      };
    });

    res.status(200).json({
      totalRecords: result.recordset?.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getStoreIssueDetails = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
      .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_StoreIssue_Details");

    const formattedData = result.recordset.map((row) => {
      return {
        ...row,
        IssueDate: dMY(row.IssueDate),
      };
    });

    res.status(200).json({
      totalRecords: result.recordset?.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMechanicalScheduledDetails = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
      .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_Mechanical_Details");

    const formattedData = result.recordset.map((row) => {
      return {
        ...row,
        LastMaintenanceDate: dMY(row.LastMaintenanceDate),
        NextServiceDate: dMY(row.NextServiceDate),
      };
    });

    res.status(200).json({
      totalRecords: result.recordset?.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMechanicalPendingsDetails = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
      .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_Mechanical_Pendings_Details");

    const formattedData = result.recordset.map((row) => {
      return {
        ...row,
        LastMaintenanceDate: dMY(row.LastMaintenanceDate),
        NextServiceDate: dMY(row.NextServiceDate),
      };
    });

    res.status(200).json({
      totalRecords: result.recordset?.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getElectricalScheduledDetails = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
      .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_Electrical_Details");

    const formattedData = result.recordset.map((row) => {
      return {
        ...row,
        LastMaintenanceDate: dMY(row.LastMaintenanceDate),
        NextServiceDate: dMY(row.NextServiceDate),
      };
    });

    res.status(200).json({
      totalRecords: result.recordset?.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getElectricalPendingsDetails = async (req, res) => {
  try {
    const paramId = req.params;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
      .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_Electrical_Pendings_Details");

    const formattedData = result.recordset.map((row) => {
      return {
        ...row,
        LastMaintenanceDate: dMY(row.LastMaintenanceDate),
        NextServiceDate: dMY(row.NextServiceDate),
      };
    });

    res.status(200).json({
      totalRecords: result.recordset?.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


export const getPayrollStrengthDetails = async (req, res) => {
  try {
    const paramId = req.params;
    console.log(paramId, 'paramId 3242342');
    
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Fix: Add BranchCode
    applyBranchCode(request, req.headers);

    let result = await request
      .input("DepartmentCode", sql.Int, parseInt(paramId?.id))
      // .input("ToDay", sql.Bit, parseInt(paramId?.today))
      .execute("web_sp_DashBoard_PayrollStrength_Details");

    const formattedData = result.recordset.map((row) => {
      return {
        ...row,
      };
    });

    res.status(200).json({
      totalRecords: result.recordset?.length,
      data: formattedData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
