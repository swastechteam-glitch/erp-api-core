import express from "express";
import {
  checkEInvoiceAuth,
  getEInvoiceConfig,
  getEInvoiceWorklist,
  generateInvoice,
} from "../controllers/einvoice.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// E-Invoice (GST IRN) — GSTRobo GSP. All routes require an app login token.
router.get("/health", authenticate, checkEInvoiceAuth);
router.get("/config", authenticate, getEInvoiceConfig);
router.get("/worklist", authenticate, getEInvoiceWorklist);
router.post("/generate", authenticate, generateInvoice);

export default router;
