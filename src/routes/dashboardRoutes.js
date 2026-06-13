import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { getDashboard, getCottonPurchase, getCottonGRN, getCottonIssue, getCottonStock, getYarnProduction, getYarnSalesOrder, getYarnSales, 
getYarnStock, getWasteProduction, getWasteSales, getWasteStock, getCottonPurchaseOrderDetails, getCottonIssueDetails, getYarnSalesOrderDetails, 
getYarnSalesDetails, getWasteSalesDetails, getStorePurchase, getStoreIssue, getStorePurchaseDetails, getStoreIssueDetails, getStoreStock,
 getMechanicalScheduled, getMechanicalPendings, getElectricalScheduled, getElectricalPendings,
getMechanicalScheduledDetails,
getMechanicalPendingsDetails,
getElectricalScheduledDetails,
getElectricalPendingsDetails,
getPreCostingCount,
getCottonGRNDetails,
preCostingCalculations,
getOverAllCosting,
getLastSync,
getgraphView,
getDashboardPayrollSalaryDeptWise,
getDashboardPayrollOTSalaryDeptWise,
getDashboardPayrollStrengthDeptWise,
getPayrollStrengthDetails,
 } from "../controllers/dashboard.controller.js";


const router = express.Router();
// 1st Page Dashboard Data
router.get('/dashboard', authenticate, getDashboard);

router.get('/dashboard/last-sync', authenticate, getLastSync);

router.get('/dashboard/graph-view', authenticate, getgraphView);

// 2nd Page Dashboard Data - Pre Costing
router.get('/dashboard/pre-costing/count', authenticate, getPreCostingCount);
router.post('/dashboard/pre-costing/calculations', authenticate, preCostingCalculations);

// 2nd Page Dashboard Data - Over All Costing
router.get('/dashboard/over-all-costing', authenticate, getOverAllCosting);

// 2nd Page Dashboard Data - Cotton
router.get('/dashboard/cotton/purchase', authenticate, getCottonPurchase);
router.get('/dashboard/cotton/grn', authenticate, getCottonGRN);
router.get('/dashboard/cotton/issue', authenticate, getCottonIssue);
router.get('/dashboard/cotton/stock', authenticate, getCottonStock);

// 2nd Page Dashboard Data - Yarn
router.get('/dashboard/yarn/production', authenticate, getYarnProduction);
router.get('/dashboard/yarn/sales-order', authenticate, getYarnSalesOrder);
router.get('/dashboard/yarn/sales', authenticate, getYarnSales);
router.get('/dashboard/yarn/stock', authenticate, getYarnStock);

// 2nd Page Dashboard Data - Yarn
router.get('/dashboard/waste/production', authenticate, getWasteProduction);
router.get('/dashboard/waste/sales', authenticate, getWasteSales);
router.get('/dashboard/waste/stock', authenticate, getWasteStock);

// 2nd Page Dashboard Data - Store
router.get('/dashboard/store/purchase', authenticate, getStorePurchase);
router.get('/dashboard/store/issue', authenticate, getStoreIssue);
router.get('/dashboard/store/stock/:packingStock', authenticate, getStoreStock);

// 2nd Page Dashboard Data - Mechanical
router.get('/dashboard/mechanical/scheduled', authenticate, getMechanicalScheduled);
router.get('/dashboard/mechanical/pendings', authenticate, getMechanicalPendings);


// 2nd Page Dashboard Data - HRM Payroll
router.get('/dashboard/payroll/salary', authenticate, getDashboardPayrollSalaryDeptWise);
router.get('/dashboard/payroll/ot-salary', authenticate, getDashboardPayrollOTSalaryDeptWise);
router.get('/dashboard/payroll/strength', authenticate, getDashboardPayrollStrengthDeptWise);

// 2nd Page Dashboard Data - Electrical
router.get('/dashboard/electrical/scheduled', authenticate, getElectricalScheduled);
router.get('/dashboard/electrical/pendings', authenticate, getElectricalPendings);

// 3rd Page Dashboard Data - Cotton
router.get('/dashboard/cotton/purchase-order/details/:id/:today', authenticate, getCottonPurchaseOrderDetails);
router.get('/dashboard/cotton/grn/details/:id/:today', authenticate, getCottonGRNDetails);
router.get('/dashboard/cotton/issue/details/:id/:today', authenticate, getCottonIssueDetails);

// 3rd Page Dashboard Data - Yarn
router.get('/dashboard/yarn/sales-order/details/:id/:today', authenticate, getYarnSalesOrderDetails);
router.get('/dashboard/yarn/sales/details/:id/:today', authenticate, getYarnSalesDetails);

// 3rd Page Dashboard Data - Waste
router.get('/dashboard/waste/sales/details/:id/:today', authenticate, getWasteSalesDetails);

// 3rd Page Dashboard Data - Store
router.get('/dashboard/store/purchase/details/:id/:today', authenticate, getStorePurchaseDetails);
router.get('/dashboard/store/issue/details/:id/:today', authenticate, getStoreIssueDetails);

// 3rd Page Dashboard Data - Mechanical
router.get('/dashboard/mechanical/scheduled/details/:id/:today', authenticate, getMechanicalScheduledDetails);
router.get('/dashboard/mechanical/pendings/details/:id/:today', authenticate, getMechanicalPendingsDetails);

// 3rd Page Dashboard Data - Electrical
router.get('/dashboard/electrical/scheduled/details/:id/:today', authenticate, getElectricalScheduledDetails);
router.get('/dashboard/electrical/pendings/details/:id/:today', authenticate, getElectricalPendingsDetails);


// 3rd Page Dashboard Data - PAYROLL
router.get('/dashboard/payroll/strength/details/:id', authenticate, getPayrollStrengthDetails);


export default router;