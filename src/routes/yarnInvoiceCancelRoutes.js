import express from "express";
import { getList, getReport, cancel } from "../controllers/yarnInvoiceCancel.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Invoice Cancel (frmInvoiceCancel).
router.get("/lists", authenticate, getList);                    // cancellable invoices
router.get("/report/:invoiceCode", authenticate, getReport);    // invoice preview
router.post("/cancel/:invoiceCode", authenticate, cancel);      // cancel the bill

export default router;
