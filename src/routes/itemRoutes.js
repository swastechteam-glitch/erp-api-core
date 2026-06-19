import express from "express";
import {
  getItemList,
  getItemById,
  getItemGroupsDropdown,
  getItemCategoriesDropdown,
  getItemUsageTypesDropdown,
  getItemUomsDropdown,
  getTaxesDropdown,
  getDepartmentsDropdown,
  createItem,
  updateItem,
  deleteItem,
} from "../controllers/item.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Item master CRUD (frmItem)
router.get("/lists", authenticate, getItemList);

// Dropdown sources
router.get("/item-groups", authenticate, getItemGroupsDropdown);
router.get("/item-categories/:itemGroupCode", authenticate, getItemCategoriesDropdown);
router.get("/item-usage-types", authenticate, getItemUsageTypesDropdown);
router.get("/item-uoms", authenticate, getItemUomsDropdown);
router.get("/taxes", authenticate, getTaxesDropdown);
router.get("/departments", authenticate, getDepartmentsDropdown);

router.get("/list/:itemCode", authenticate, getItemById);
router.post("/create", authenticate, createItem);
router.put("/update/:itemCode", authenticate, updateItem);
router.delete("/delete/:itemCode", authenticate, deleteItem);

export default router;
