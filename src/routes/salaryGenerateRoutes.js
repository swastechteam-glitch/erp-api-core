import express from "express";
import {
  getOptions,
  getPayPeriods,
  startGenerate,
  getProgress,
} from "../controllers/salaryGenerate.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Salary Generate (frmGenerateSalary / rptSalaryGenerate)
router.get("/options", authenticate, getOptions);
router.get("/pay-periods/:payTypeCode", authenticate, getPayPeriods);
router.post("/generate", authenticate, startGenerate);
router.get("/progress/:runId", authenticate, getProgress);

export default router;
