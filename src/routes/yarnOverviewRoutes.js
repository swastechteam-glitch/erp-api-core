import express from "express";
import { getSalesOrderOverview, getInvoiceOverview, getSalesReturnOverview, yarnInvoiceApproval, yarnSalesOrderApproval, yarnSalesReturnApproval } from "../controllers/yarnOverview.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";



const router = express.Router();

router.post(
  "/yarn-invoice/approve",
  authenticate,
//   purchaseOrderValidationRules,
//   validatePurchaseOrder,
  yarnInvoiceApproval
);

router.post(
  "/yarn-sales-order/approve",
  authenticate,
//   purchaseOrderValidationRules,
//   validatePurchaseOrder,
  yarnSalesOrderApproval
);

router.post(
  "/yarn-sales-return/approve",
  authenticate,
//   purchaseOrderValidationRules,
//   validatePurchaseOrder,
  yarnSalesReturnApproval
);



router.get('/invoice-overview/list/:id', authenticate, getInvoiceOverview)
router.get('/sales-order-overview/list/:id', authenticate, getSalesOrderOverview)
router.get('/sales-return-overview/list/:id', authenticate, getSalesReturnOverview)


export default router;
