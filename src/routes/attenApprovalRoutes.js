import express from "express";
import { getPendings, approve } from "../controllers/attenApproval.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Attendance & OT Approval — Stage 1 (frmAttendanceApprove)
router.get("/pendings", authenticate, getPendings);
router.post("/approve", authenticate, approve);

export default router;
