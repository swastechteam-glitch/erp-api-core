import express from "express";
import { getCottonReports } from "../controllers/cotton.reports.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { cottonPurchaseOrderReport } from "../controllers/report/cotton/cottonPurchaseOrder.js";
import { cottonPurchaseOrderPendingReport } from "../controllers/report/cotton/cottonPurchaseOrderPending.js";
import { cottonArrivalReport } from "../controllers/report/cotton/cottonArrival.js";
import { cottonWeighmentReportHandler } from "../controllers/report/cotton/cottonWeighmentReport.js";
import { cottonMixingIssueReport } from "../controllers/report/cotton/cottonMixingIssue.js";
import { cottonStockReportHandler } from "../controllers/report/cotton/cottonStockReport.js";

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

export default router;
