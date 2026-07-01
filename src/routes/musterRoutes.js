import express from "express";
import {
  getOptions,
  getPayPeriods,
  startGenerate,
  getProgress,
} from "../controllers/musterGenerate.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Muster Generate (frmGenerateMuster / rptMusterGenerate)
router.get("/options", authenticate, getOptions);
router.get("/pay-periods/:payTypeCode", authenticate, getPayPeriods);
router.post("/generate", authenticate, startGenerate);
router.get("/progress/:runId", authenticate, getProgress);

export default router;
