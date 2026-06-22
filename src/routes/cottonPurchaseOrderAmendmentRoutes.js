import express from "express";
import {
  getCPONumbers,
  getPendingQty,
  amendCottonPurchaseOrder,
} from "../controllers/cottonPurchaseOrderAmendment.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Purchase Order Amendment (frmCottonPurchaseOrder_Amendment)
router.get("/cpo-numbers", authenticate, getCPONumbers);
router.get("/pending-qty", authenticate, getPendingQty);
router.put("/amend/:code", authenticate, amendCottonPurchaseOrder);

export default router;
