import express from "express";
import {
  creditNoteApproval,
  creditNoteDetailsOverview,
  debitNoteApproval,
  debitNoteDetailsOverview,
  financeAdvanceReqApprovalStage1,
  financeAdvanceReqApprovalStage2,
  getAdvPaymentApprove1Overview,
  getAdvPaymentApprove2Overview,
  getPaymentApproveOverview,
  getReceipt1Overview,
  paymentApproval,
  receiptApprovalOne,
  receiptApprovalTwo,
} from "../controllers/financeOverview.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Approval Functions

router.post(
  "/finance-advance-req-stage-one/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  financeAdvanceReqApprovalStage1
);

router.post(
  "/finance-advance-req-stage-two/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  financeAdvanceReqApprovalStage2
);

router.post(
  "/payment/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  paymentApproval
);

router.post(
  "/receipt-one/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  receiptApprovalOne
);

router.post(
  "/receipt-two/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  receiptApprovalTwo
);

router.post(
  "/credit-note/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  creditNoteApproval
);

router.post(
  "/debit-note/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  debitNoteApproval
);

// Get List Functions
router.get(
  "/receipt-approvals-overview/list/:id",
  authenticate,
  getReceipt1Overview
);
router.get(
  "/adv-payment-approve1-overview/list/:id",
  authenticate,
  getAdvPaymentApprove1Overview
);
router.get(
  "/adv-payment-approve2-overview/list/:id",
  authenticate,
  getAdvPaymentApprove2Overview
);
router.get(
  "/payment-approve-overview/list/:id",
  authenticate,
  getPaymentApproveOverview
);
router.get(
  "/credit-note-details-overview/list/:id",
  authenticate,
  creditNoteDetailsOverview
);
router.get(
  "/debit-note-details-overview/list/:id",
  authenticate,
  debitNoteDetailsOverview
);

export default router;
