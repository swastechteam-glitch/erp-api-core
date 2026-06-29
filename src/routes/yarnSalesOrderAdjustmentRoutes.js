import express from "express";
import {
  getPending,
  getDetail,
  adjust,
} from "../controllers/yarnSalesOrderAdjustment.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Sales Order Adjustment (frmSalesOrderAdjustment).
router.get("/pending", authenticate, getPending);          // pending order lines
router.get("/detail/:soCode", authenticate, getDetail);    // order line details preview
router.post("/adjust", authenticate, adjust);              // set CancelQty + CancelRemarks

export default router;
