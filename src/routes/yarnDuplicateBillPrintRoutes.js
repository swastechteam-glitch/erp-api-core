import express from "express";
import {
  getOptions,
  getList,
  getReport,
} from "../controllers/yarnDuplicateBillPrint.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Duplicate Bill Print (frmInvoiceDuplicatePrint).
router.get("/options", authenticate, getOptions);                 // customers / bills / companies
router.get("/lists", authenticate, getList);                      // matching invoices
router.get("/report/:invoiceCode", authenticate, getReport);      // printable invoice data

export default router;
