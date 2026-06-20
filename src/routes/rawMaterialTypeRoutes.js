import express from "express";
import {
  getRawMaterialTypeList,
  getRawMaterialTypeById,
  createRawMaterialType,
  updateRawMaterialType,
  deleteRawMaterialType,
} from "../controllers/rawMaterialType.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Raw Material Type master CRUD (frmRawMaterialType)
router.get("/lists", authenticate, getRawMaterialTypeList);
router.get("/list/:rawMaterialTypeCode", authenticate, getRawMaterialTypeById);
router.post("/create", authenticate, createRawMaterialType);
router.put("/update/:rawMaterialTypeCode", authenticate, updateRawMaterialType);
router.delete("/delete/:rawMaterialTypeCode", authenticate, deleteRawMaterialType);

export default router;
