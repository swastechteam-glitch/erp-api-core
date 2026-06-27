import express from "express";
import {
  getCompanies,
  getSupplierList,
  getOrders,
  getList,
  getDocument,
  getPdf,
  sendEmail,
} from "../controllers/purchaseOrderPrint.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Purchase Order Doc Print (rptPODisplay) — view / print / email.
router.get("/companies", authenticate, getCompanies);
router.get("/suppliers", authenticate, getSupplierList);
router.get("/orders", authenticate, getOrders);
router.get("/list", authenticate, getList);
router.get("/document", authenticate, getDocument);
router.get("/pdf", authenticate, getPdf);
router.post("/email", authenticate, sendEmail);

export default router;
