import express from "express";
import { getOptions, transfer } from "../controllers/attenTransfer.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Attendance Transfer (frmAttendenceTransfer)
router.get("/options", authenticate, getOptions);
router.post("/transfer", authenticate, transfer);

export default router;
