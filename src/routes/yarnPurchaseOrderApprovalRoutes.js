import express from "express";
import {
  getPending,
  getDetail,
  approve,
  reject,
} from "../controllers/yarnPurchaseOrderApproval.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Purchase Order Approval (frmYarnPurchaseOrderApproval).
router.get("/pending", authenticate, getPending);          // orders awaiting approval
router.get("/detail/:code", authenticate, getDetail);      // order line details preview
router.post("/approve/:code", authenticate, approve);      // approve one order
router.post("/reject/:code", authenticate, reject);        // reject one order

export default router;
