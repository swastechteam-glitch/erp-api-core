import express from "express";
import {
  getItemGroupList,
  getItemGroupById,
  createItemGroup,
  updateItemGroup,
  deleteItemGroup,
} from "../controllers/itemGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Item Group master CRUD (frmItemGroup)
router.get("/lists", authenticate, getItemGroupList);
router.get("/list/:itemGroupCode", authenticate, getItemGroupById);
router.post("/create", authenticate, createItemGroup);
router.put("/update/:itemGroupCode", authenticate, updateItemGroup);
router.delete("/delete/:itemGroupCode", authenticate, deleteItemGroup);

export default router;
