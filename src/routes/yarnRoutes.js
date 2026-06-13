import express from "express";
import { getInvoiceApproval, getSalesOrderApproval, getSalesReturnApproval, getCustomerApproval, getDespatchApproval, getPOApproval,
    getTransFreightInvApproval, getAgentCommissionApproval
 } from "../controllers/yarn.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";


const router = express.Router();

router.get('/invoice-approvals/list', authenticate, getInvoiceApproval);
router.get('/sales-order-approvals/list', authenticate, getSalesOrderApproval);
router.get('/sales-return-approvals/list', authenticate, getSalesReturnApproval);
router.get('/customer-approvals/list', authenticate, getCustomerApproval);
router.get('/despatch-approvals/list', authenticate, getDespatchApproval);
router.get('/po-approvals/list', authenticate, getPOApproval);
router.get('/transport-freight-inv-approvals/list', authenticate, getTransFreightInvApproval);
router.get('/agent-commission-approvals/list', authenticate, getAgentCommissionApproval);


export default router;
