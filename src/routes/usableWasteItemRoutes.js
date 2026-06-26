import express from "express";
import {
  getUsableWasteItemOptions,
  getUsableWasteItemList,
  getUsableWasteItemById,
  createUsableWasteItem,
  updateUsableWasteItem,
  deleteUsableWasteItem,
} from "../controllers/usableWasteItem.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Usable Waste Item master CRUD (frmUsableWasteItem / frmUsableWasteItemDetails)
router.get("/options", authenticate, getUsableWasteItemOptions);
router.get("/lists", authenticate, getUsableWasteItemList);
router.get("/list/:usableWasteItemCode", authenticate, getUsableWasteItemById);
router.post("/create", authenticate, createUsableWasteItem);
router.put("/update/:usableWasteItemCode", authenticate, updateUsableWasteItem);
router.delete("/delete/:usableWasteItemCode", authenticate, deleteUsableWasteItem);

export default router;
