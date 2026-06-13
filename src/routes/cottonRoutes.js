import express from "express";
import { getQualityTestApproval ,getPurchaseOrderApproval, getIssueLotTestApproval, getTransferApproval, getBillPassingApproval, 
    getCottonAllowanceApproval, getSupplierCurBalApproval, getRejectLotApproval, getArrival1Approval, getArrival2Approval, getWeighApproveToStockApproval,
    getWeighApproveForPaymentApproval, getAllowanceGenerationApproval} from "../controllers/cotton.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";


const router = express.Router();

router.get('/quality-test-approvals/list', authenticate, getQualityTestApproval);
router.get('/purchase-order-approvals/list',authenticate, getPurchaseOrderApproval);
router.get('/issue-lot-approvals/list',authenticate, getIssueLotTestApproval);
router.get('/transfer-approvals/list',authenticate, getTransferApproval);
router.get('/bill-passing-approvals/list',authenticate, getBillPassingApproval);
router.get('/allowance-approvals/list',authenticate, getCottonAllowanceApproval);
router.get('/supplier-cur-bl-approvals/list',authenticate, getSupplierCurBalApproval);
router.get('/reject-lot-approvals/list',authenticate, getRejectLotApproval);
router.get('/arrival1-approvals/list',authenticate, getArrival1Approval);
router.get('/arrival2-approvals/list',authenticate, getArrival2Approval);
router.get('/weigh-approve-stock-approvals/list',authenticate, getWeighApproveToStockApproval);
router.get('/weigh-approve-payment-approvals/list',authenticate, getWeighApproveForPaymentApproval);
router.get('/allowance-generation-approvals/list',authenticate, getAllowanceGenerationApproval);




export default router;
