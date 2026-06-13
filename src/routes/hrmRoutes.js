import express from "express";
import { getEmployeeApproval, getAttnManualEntryApproval, getEmpWiseIncApproval, getGradeWiseIncApproval, getOnDutyApproval, getCompensationApproval, getLeaveEntryApproval, getWasteApprovalList, getWasteInvoiceItemDetails, getEffectDateLimits, getNewJoinApproval, updateNewJoinApproval } from "../controllers/hrm.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { approveWasteInvoice } from "../controllers/hrmOverview.controller.js";


const router = express.Router();

router.get('/employee-approvals/list', authenticate, getEmployeeApproval);
router.get('/attn-manual-entry-approvals/list', authenticate, getAttnManualEntryApproval);
router.get('/emp-inc-approvals/list', authenticate, getEmpWiseIncApproval);
router.get('/grade-inc-approvals/list', authenticate, getGradeWiseIncApproval);
router.get('/effect-date-limits', authenticate, getEffectDateLimits);
router.get('/onduty-approvals/list', authenticate, getOnDutyApproval);
router.get('/compensation-approvals/list', authenticate, getCompensationApproval);
router.get('/LeaveEntry-approvals/list', authenticate, getLeaveEntryApproval);
router.get('/waste/lists', authenticate, getWasteApprovalList);
router.get('/waste/list-details/:wasteInvoiceCode', authenticate, getWasteInvoiceItemDetails);
router.get('/new-join-approval/list', authenticate, getNewJoinApproval);
router.post("/waste/approve",  authenticate, approveWasteInvoice);
router.put('/new-join-approval/update',authenticate, updateNewJoinApproval);





export default router;
