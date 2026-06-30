import express from "express";
import {
  getPending,
  getDetail,
  approve,
  reject,
} from "../controllers/yarnSalesReturnApproval.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Sales Return Approval (frmSalesReturnApproval).
router.get("/pending", authenticate, getPending);          // returns awaiting approval
router.get("/detail/:code", authenticate, getDetail);      // return line details preview
router.post("/approve/:code", authenticate, approve);      // approve one return
router.post("/reject/:code", authenticate, reject);        // reject one return

export default router;
