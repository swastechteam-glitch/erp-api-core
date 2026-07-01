import express from "express";
import { getPendings, approve } from "../controllers/attenApproval2.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Attendance & OT Approval — Stage 2 (frmAttendanceAttendanceOffLineApproval2)
router.get("/pendings", authenticate, getPendings);
router.post("/approve", authenticate, approve);

export default router;
