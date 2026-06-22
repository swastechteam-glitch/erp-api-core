import express from "express";
import {
  getMaterialTypeList,
  getMaterialTypeById,
  createMaterialType,
  updateMaterialType,
  deleteMaterialType,
} from "../controllers/materialType.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Material Type master CRUD (frmMaterialType)
router.get("/lists", authenticate, getMaterialTypeList);
router.get("/list/:code", authenticate, getMaterialTypeById);
router.post("/create", authenticate, createMaterialType);
router.put("/update/:code", authenticate, updateMaterialType);
router.delete("/delete/:code", authenticate, deleteMaterialType);

export default router;
