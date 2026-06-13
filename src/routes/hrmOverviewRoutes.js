import express from "express";
import {
  attendanceManualEntryApproval,
  CompensationWorkEntryApproval,
  employeeApproval,
  employeeWiseIncrementApproval,
  getEmployeeApproveOverview,
  gradeWIseIncrementApproval,
  leaveEntryApproval,
  onDutyEntryApprovalApproval,
} from "../controllers/hrmOverview.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/employee/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  employeeApproval
);

router.post(
  "/attendance-manual_entry/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  attendanceManualEntryApproval
);

router.post(
  "/employee-wise-increment/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  employeeWiseIncrementApproval
);

router.post(
  "/grad-wise-increment/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  gradeWIseIncrementApproval
);

router.post(
  "/on-duty-entry/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  onDutyEntryApprovalApproval
);

router.post(
  "/compensation-work-entry/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  CompensationWorkEntryApproval
);


router.post(
  "/leave-entry/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  leaveEntryApproval
);


// Get list Router

router.get(
  "/employee-approve-overview/list/:id",
  authenticate,
  getEmployeeApproveOverview
);

export default router;
