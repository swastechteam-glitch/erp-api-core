import express from "express";
import {
  getPending,
  getDetail,
  getCredit,
  approve,
} from "../controllers/yarnSalesOrderApproval.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Sales Order Approval (frmSalesOrderApproval).
router.get("/pending", authenticate, getPending);          // orders awaiting approval
router.get("/detail/:soCode", authenticate, getDetail);    // order line details preview
router.get("/credit", authenticate, getCredit);            // customer credit check
router.post("/approve/:soCode", authenticate, approve);    // approve one order

export default router;
