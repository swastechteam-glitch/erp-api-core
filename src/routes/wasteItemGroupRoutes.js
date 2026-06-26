import express from "express";
import {
  getWasteItemGroupList,
  getWasteItemGroupById,
  createWasteItemGroup,
  updateWasteItemGroup,
  deleteWasteItemGroup,
} from "../controllers/wasteItemGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Waste Item Group master CRUD (frmWasteItemGroup / frmWasteItemGroupDetails)
router.get("/lists", authenticate, getWasteItemGroupList);
router.get("/list/:wasteItemGroupCode", authenticate, getWasteItemGroupById);
router.post("/create", authenticate, createWasteItemGroup);
router.put("/update/:wasteItemGroupCode", authenticate, updateWasteItemGroup);
router.delete("/delete/:wasteItemGroupCode", authenticate, deleteWasteItemGroup);

export default router;
