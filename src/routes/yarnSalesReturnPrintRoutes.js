import express from "express";
import {
  getList,
  getReport,
} from "../controllers/yarnSalesReturnPrint.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Sales Return Print (frmSalesReturnPrint).
router.get("/lists", authenticate, getList);            // returns for the company + FY
router.get("/report/:code", authenticate, getReport);   // printable return data

export default router;
