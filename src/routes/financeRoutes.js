import express from "express";
import { getReceipt1Approval, getReceipt2Approval, getAdvReq1Approval, getAdvReq2Approval, getPaymentApproval, getCreditNoteApproval, getDebitNoteApproval } from "../controllers/finance.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";


const router = express.Router();

router.get('/receipt1-approvals/list', authenticate, getReceipt1Approval);
router.get('/receipt2-approvals/list', authenticate, getReceipt2Approval);
router.get('/adv-req1-approvals/list', authenticate, getAdvReq1Approval);
router.get('/adv-req2-approvals/list', authenticate, getAdvReq2Approval);
router.get('/payment-approvals/list', authenticate, getPaymentApproval);
router.get('/credit-note-approvals/list', authenticate, getCreditNoteApproval);
router.get('/debit-note-approvals/list', authenticate, getDebitNoteApproval);



export default router;
