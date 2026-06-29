import express from "express";
import {
  getPending,
  getDetail,
  getCredit,
  confirm,
} from "../controllers/yarnBillConfirmation.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Bill Conformation (frmInvoiceConfirmation).
router.get("/pending", authenticate, getPending);             // invoices awaiting confirmation
router.get("/detail/:invoiceCode", authenticate, getDetail);  // invoice line details
router.get("/credit", authenticate, getCredit);               // customer credit check
router.post("/confirm/:invoiceCode", authenticate, confirm);  // confirm one invoice

export default router;
