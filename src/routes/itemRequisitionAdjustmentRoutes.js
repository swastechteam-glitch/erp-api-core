import express from "express";
import {
  getList,
  adjust,
} from "../controllers/itemRequisitionAdjustment.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Item Requisition Adjustment / Cancel (frmItemRequisitionAdjustment)
router.get("/list", authenticate, getList);
router.post("/adjust", authenticate, adjust);

export default router;
