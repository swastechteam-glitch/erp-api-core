import express from "express";
import { pendings, detail, approve } from "../controllers/loanApproval.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Loan Advance Approval (frmLoanApprovalDetails)
router.get("/pendings", authenticate, pendings);
router.get("/detail/:loanCode", authenticate, detail);
router.post("/approve", authenticate, approve);

export default router;
