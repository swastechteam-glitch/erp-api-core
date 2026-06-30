import express from "express";
import {
  getList,
  getReport,
} from "../controllers/yarnGRNPrint.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn GRN Print (frmYarnGRNPrint).
router.get("/lists", authenticate, getList);            // GRNs for the company
router.get("/report/:code", authenticate, getReport);   // printable GRN data

export default router;
