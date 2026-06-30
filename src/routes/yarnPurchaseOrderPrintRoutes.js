import express from "express";
import {
  getList,
  getReport,
} from "../controllers/yarnPurchaseOrderPrint.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Purchase Order Print (frmYarnPurchaseOrderPrint).
router.get("/lists", authenticate, getList);            // orders for the company + FY
router.get("/report/:code", authenticate, getReport);   // printable order data

export default router;
