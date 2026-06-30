import express from "express";
import {
  getStatus,
  startDownload,
  getProgress,
} from "../controllers/downloadMachine.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Download From Machine (frmAutoDownload)
router.get("/status", authenticate, getStatus);
router.post("/download", authenticate, startDownload);
router.get("/progress/:runId", authenticate, getProgress);

export default router;
