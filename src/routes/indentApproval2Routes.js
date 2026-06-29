import express from "express";
import { getOptions, getPending, getIndentLines, approve } from "../controllers/indentApproval2.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Indent Approval Stage-2 (frmIssueApproval2).
router.get("/options", authenticate, getOptions);
router.get("/pending", authenticate, getPending);
router.get("/indent-lines", authenticate, getIndentLines);
router.post("/approve", authenticate, approve);

export default router;
