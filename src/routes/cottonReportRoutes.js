import express from "express";
import { getCottonReports } from "../controllers/cotton.reports.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { cottonPurchaseOrderReport } from "../controllers/report/cotton/cottonPurchaseOrder.js";
import { cottonPurchaseOrderPendingReport } from "../controllers/report/cotton/cottonPurchaseOrderPending.js";
import { cottonArrivalReport } from "../controllers/report/cotton/cottonArrival.js";
import { cottonWeighmentReportHandler } from "../controllers/report/cotton/cottonWeighmentReport.js";
import { cottonMixingIssueReport } from "../controllers/report/cotton/cottonMixingIssue.js";
import { cottonStockReportHandler } from "../controllers/report/cotton/cottonStockReport.js";
import { cottonQualityTestReport } from "../controllers/report/cotton/cottonQualityTest.js";
import { cottonAllowanceReport } from "../controllers/report/cotton/cottonAllowance.js";
import { cottonPurchaseOrderApprovalPendingReport } from "../controllers/report/cotton/cottonPurchaseOrderApprovalPending.js";
import { cottonPurchaseOrderApprovalReport } from "../controllers/report/cotton/cottonPurchaseOrderApproval.js";
import { cottonLotApprovalReport } from "../controllers/report/cotton/cottonLotApproval.js";
import { cottonQualityApprovalPendingReport } from "../controllers/report/cotton/cottonQualityApprovalPending.js";
import { cottonRejectReport } from "../controllers/report/cotton/cottonReject.js";
import { cottonLotWiseReport } from "../controllers/report/cotton/cottonLotWise.js";

const router = express.Router();

router.get('/export', authenticate, getCottonReports);

// PDF report endpoints (mirrors the UI menu structure under "Cotton").
// Purchase Order has 4 group-by modes selectable via ?groupBy=date|supplier|variety|agent
router.get('/purchase-order', authenticate, cottonPurchaseOrderReport);
router.get('/purchase-order-pending', authenticate, cottonPurchaseOrderPendingReport);
router.get('/arrival', authenticate, cottonArrivalReport);
router.get('/weighment', authenticate, cottonWeighmentReportHandler);
router.get('/mixing-issue', authenticate, cottonMixingIssueReport);
router.get('/stock', authenticate, cottonStockReportHandler);
// Quality test listing — ?groupBy=date|supplier|variety
router.get('/quality-test', authenticate, cottonQualityTestReport);
// Allowance — ?groupBy=date|supplier|agent|rawmaterial|milllot
// (+ optional supplierCodes / agentCodes / rawMaterialCodes filter lists)
router.get('/allowance', authenticate, cottonAllowanceReport);
// PO Approval Pending — no date range; CompanyCode (+ optional supplierCodes /
// agentCodes filter lists).
router.get('/po-approval-pending', authenticate, cottonPurchaseOrderApprovalPendingReport);
// PO Approval (approved POs) — date range; CompanyCode (+ optional supplierCodes
// / agentCodes filter lists). Grouped by Approval Date.
router.get('/po-approval', authenticate, cottonPurchaseOrderApprovalReport);
// Lot Approval — date range; CompanyCode (+ optional supplierCodes / agentCodes
// filter lists). Grouped by Cotton Lot Approval Date.
router.get('/lot-approval', authenticate, cottonLotApprovalReport);
// Quality Test Approval Pending — no date range; CompanyCode (+ optional
// supplierCodes / agentCodes / stationCodes / rawMaterialCodes filter lists).
router.get('/quality-approval-pending', authenticate, cottonQualityApprovalPendingReport);
// Reject / Sales — date range; CompanyCode. Report type ?groupBy=all|reject|sales
// selects both / reject-only / sales-only. Grouped by Reject/Sales flag.
router.get('/reject', authenticate, cottonRejectReport);
// Lot Wise (stock card) — no date range; CompanyCode (+ optional fromLot / toLot
// ArrivalCode range, 0 = all). One stock card per arrived lot.
router.get('/lot-wise', authenticate, cottonLotWiseReport);

export default router;
