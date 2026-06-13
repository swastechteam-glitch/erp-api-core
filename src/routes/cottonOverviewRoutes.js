import express from "express";
import {
  getPurchaseOrderOverview,
  getQualityTestOverview,
  getIssueLotOverview,
  getBillPassingOverview,
  getAllowanceGenerationOverview,
  getRejectLotOverview,
  approveCotton,
  approveQualityTest,
  approveIssueLotTest,
  approveBillPassing,
  approveAllowanceGeneration,
  approveRejectLot,
} from "../controllers/cottonOverview.controller.js";
import { purchaseOrderValidationRules, validatePurchaseOrder } from "../validation/purchaseOrderValidation.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/purchase-order/approve",
  authenticate,
  purchaseOrderValidationRules,
  validatePurchaseOrder,
  approveCotton
);

router.post(
  "/quality-test/approve",
  authenticate,
  // purchaseOrderValidationRules,
  // validatePurchaseOrder,
  approveQualityTest
);

router.post(
  "/issue-lot-test/approve",
  authenticate,
  // purchaseOrderValidationRules,
  // validatePurchaseOrder,
  approveIssueLotTest
);

router.post(
  "/bill-passing/approve",
  authenticate,
  // purchaseOrderValidationRules,
  // validatePurchaseOrder,
  approveBillPassing
);

router.post(
  "/allowance-generation/approve",
  authenticate,
  // purchaseOrderValidationRules,
  // validatePurchaseOrder,
  approveAllowanceGeneration
);

router.post(
  "/reject-lot/approve",
  authenticate,
  // purchaseOrderValidationRules,
  // validatePurchaseOrder,
  approveRejectLot
);

router.get("/purchase-order-overview/list/:id",authenticate, getPurchaseOrderOverview);
router.get("/quality-test-overview/list/:id",authenticate, getQualityTestOverview);
router.get("/issue-lot-overview/list/:id",authenticate,getIssueLotOverview);
router.get("/bill-passing-overview/list/:id", authenticate, getBillPassingOverview);
router.get(
  "/allowance-generation-overview/list/:id",
  authenticate,
  getAllowanceGenerationOverview
);
router.get("/reject-lot-overview/list/:id",authenticate, getRejectLotOverview);

export default router;
