import express from "express";
import {
  getItemUsageTypeList,
  getItemUsageTypeById,
  createItemUsageType,
  updateItemUsageType,
  deleteItemUsageType,
} from "../controllers/itemUsageType.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Item Usage Type master CRUD (frmItemUsageType)
router.get("/lists", authenticate, getItemUsageTypeList);
router.get("/list/:itemUsageTypeCode", authenticate, getItemUsageTypeById);
router.post("/create", authenticate, createItemUsageType);
router.put("/update/:itemUsageTypeCode", authenticate, updateItemUsageType);
router.delete("/delete/:itemUsageTypeCode", authenticate, deleteItemUsageType);

export default router;
