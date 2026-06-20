import express from "express";
import {
  getRawMaterialList,
  getRawMaterialById,
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
  getRawMaterialOptions,
} from "../controllers/rawMaterial.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Raw Material master CRUD (frmRawMaterial)
router.get("/options", authenticate, getRawMaterialOptions); // Raw Material Type lookup
router.get("/lists", authenticate, getRawMaterialList);
router.get("/list/:rawMaterialCode", authenticate, getRawMaterialById);
router.post("/create", authenticate, createRawMaterial);
router.put("/update/:rawMaterialCode", authenticate, updateRawMaterial);
router.delete("/delete/:rawMaterialCode", authenticate, deleteRawMaterial);

export default router;
