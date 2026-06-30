import express from "express";
import {
  getTypes,
  getReport,
} from "../controllers/yarnMasterReports.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Master Reports (rptCountName).
router.get("/types", authenticate, getTypes);     // selectable report types
router.get("/report", authenticate, getReport);   // run one master report

export default router;
