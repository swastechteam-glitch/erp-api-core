import express from "express";
import {
  getNextNo,
  getReturnSuppliers,
  getGRNs,
  getReturnItems,
  getItemStock,
  create,
} from "../controllers/purchaseReturn.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Purchase Return (frmPurchaseReturn) — direct entry only (no list/edit).
router.get("/next-no", authenticate, getNextNo);
router.get("/suppliers", authenticate, getReturnSuppliers);
router.get("/grns", authenticate, getGRNs);
router.get("/items", authenticate, getReturnItems);
router.get("/item-stock", authenticate, getItemStock);
router.post("/create", authenticate, create);

export default router;
