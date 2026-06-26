import express from "express";
import {
  getOptions,
  getNextInvoiceNo,
  getList,
  getById,
  createScrapInvoice,
  updateScrapInvoice,
  deleteScrapInvoice,
} from "../controllers/scrapInvoice.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Scrap Invoice entry (frmScrabInvoice / frmScrabInvoiceDetails)
router.get("/options", authenticate, getOptions);
router.get("/next-invoice-no", authenticate, getNextInvoiceNo);
router.get("/lists", authenticate, getList);
router.get("/list/:scrapInvoiceCode", authenticate, getById);
router.post("/create", authenticate, createScrapInvoice);
router.put("/update/:scrapInvoiceCode", authenticate, updateScrapInvoice);
router.delete("/delete/:scrapInvoiceCode", authenticate, deleteScrapInvoice);

export default router;
