import express from "express";
import {
  getOptions,
  getNextInvoiceNo,
  getPendingDC,
  getPendingWeighBridge,
  getDCItems,
  getDCItemBales,
  getList,
  getById,
  createWasteInvoice,
  updateWasteInvoice,
  deleteWasteInvoice,
} from "../controllers/wasteInvoice.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Waste Invoice entry (frmWasteInvoice / frmWasteInvoiceDetails)
router.get("/options", authenticate, getOptions);
router.get("/next-invoice-no", authenticate, getNextInvoiceNo);
router.get("/pending-dc", authenticate, getPendingDC);
router.get("/pending-weighbridge", authenticate, getPendingWeighBridge);
router.get("/dc-items", authenticate, getDCItems);
router.get("/dc-item-bales", authenticate, getDCItemBales);
router.get("/lists", authenticate, getList);
router.get("/list/:wasteInvoiceCode", authenticate, getById);
router.post("/create", authenticate, createWasteInvoice);
router.put("/update/:wasteInvoiceCode", authenticate, updateWasteInvoice);
router.delete("/delete/:wasteInvoiceCode", authenticate, deleteWasteInvoice);

export default router;
