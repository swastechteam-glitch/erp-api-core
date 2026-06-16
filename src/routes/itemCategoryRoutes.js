import express from "express";
import {
  getItemCategoryList,
  getItemGroupsDropdown,
  getItemCategoryById,
  createItemCategory,
  updateItemCategory,
  deleteItemCategory,
} from "../controllers/itemCategory.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Item Category master CRUD (frmItemCategory)
router.get("/lists", authenticate, getItemCategoryList);
router.get("/item-groups", authenticate, getItemGroupsDropdown);
router.get("/list/:itemCategoryCode", authenticate, getItemCategoryById);
router.post("/create", authenticate, createItemCategory);
router.put("/update/:itemCategoryCode", authenticate, updateItemCategory);
router.delete("/delete/:itemCategoryCode", authenticate, deleteItemCategory);

export default router;
