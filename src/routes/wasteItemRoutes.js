import express from "express";
import {
  getWasteItemOptions,
  getWasteItemList,
  getWasteItemById,
  createWasteItem,
  updateWasteItem,
  deleteWasteItem,
} from "../controllers/wasteItem.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Waste Item master CRUD (frmWasteItem / frmWasteItemDetails)
router.get("/options", authenticate, getWasteItemOptions);
router.get("/lists", authenticate, getWasteItemList);
router.get("/list/:wasteItemCode", authenticate, getWasteItemById);
router.post("/create", authenticate, createWasteItem);
router.put("/update/:wasteItemCode", authenticate, updateWasteItem);
router.delete("/delete/:wasteItemCode", authenticate, deleteWasteItem);

export default router;
