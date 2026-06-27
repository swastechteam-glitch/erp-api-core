import express from "express";
import { getPurchaseAdviceApproval, getPurchaseOrderApproval, getPurchaseOrderApprovalFiltered, getPurchaseOrderGMApproval, getPurchaseOrderMDApproval, getBillPassingApproval,
     getGoodsInApproval, getGoodsOutApproval, getGoodsOut2Approval, getPurchaseReqApproval, getPOAmendment1Approval, getPOAmendment2Approval, 
     getIndent1Approval, getIndent2Approval, getIssueApproval, getStockAdjApproval, getServiceReq1Approval, getServiceReq2Approval, getServiceBillPassApproval, getPurchaseOrderGMApprovalFiltered, getPurchaseOrderMDApprovalFiltered } from "../controllers/stores.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";


const router = express.Router();

router.get('/purchase-advice-approvals/list', authenticate, getPurchaseAdviceApproval);
router.get('/purchase-order-approvals/list', authenticate, getPurchaseOrderApproval);
router.get('/purchase-order-approvals/filtered', authenticate, getPurchaseOrderApprovalFiltered);
router.get('/purchase-order-gm-approvals/list', authenticate, getPurchaseOrderGMApproval);
router.get('/purchase-order-gm-approvals/filtered', authenticate, getPurchaseOrderGMApprovalFiltered);
router.get('/purchase-order-md-approvals/list', authenticate, getPurchaseOrderMDApproval);
router.get('/purchase-order-md-approvals/filtered', authenticate, getPurchaseOrderMDApprovalFiltered);
router.get('/bill-passing-approvals/list', authenticate, getBillPassingApproval);
router.get('/goods-in-approvals/list', authenticate, getGoodsInApproval);
router.get('/goods-out-approvals/list', authenticate, getGoodsOutApproval);
router.get('/goods-out-2-approvals/list', authenticate, getGoodsOut2Approval);
router.get('/purchase-req-approvals/list', authenticate, getPurchaseReqApproval);
router.get('/po-amendment1-approvals/list', authenticate, getPOAmendment1Approval);
router.get('/po-amendment2-approvals/list', authenticate, getPOAmendment2Approval);
router.get('/indent1-approvals/list', authenticate, getIndent1Approval);
router.get('/indent2-approvals/list', authenticate, getIndent2Approval);
router.get('/issue-approvals/list', authenticate, getIssueApproval);
router.get('/stock-adj-approvals/list', authenticate, getStockAdjApproval);
router.get('/service-req1-approvals/list', authenticate, getServiceReq1Approval);
router.get('/service-req2-approvals/list', authenticate, getServiceReq2Approval);
router.get('/service-bill-pass-approvals/list', authenticate, getServiceBillPassApproval);


export default router;
