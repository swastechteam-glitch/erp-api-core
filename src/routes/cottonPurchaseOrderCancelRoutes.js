import express from "express";
import {
  getPendingQty,
  cancelCottonPurchaseOrder,
} from "../controllers/cottonPurchaseOrderCancel.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Purchase Order Cancel / Adjustment (frmCottonPurchaseOrderCancel)
router.get("/pending-qty", authenticate, getPendingQty);
router.put("/cancel/:code", authenticate, cancelCottonPurchaseOrder);

export default router;
