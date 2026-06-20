import express from "express";
import {
  getCottonPackingMaterialList,
  getCottonPackingMaterialById,
  createCottonPackingMaterial,
  updateCottonPackingMaterial,
  deleteCottonPackingMaterial,
} from "../controllers/cottonPackingMaterial.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Packing Material master CRUD (frmCottonPackingMaterial)
router.get("/lists", authenticate, getCottonPackingMaterialList);
router.get("/list/:cottonPackingMaterialCode", authenticate, getCottonPackingMaterialById);
router.post("/create", authenticate, createCottonPackingMaterial);
router.put("/update/:cottonPackingMaterialCode", authenticate, updateCottonPackingMaterial);
router.delete("/delete/:cottonPackingMaterialCode", authenticate, deleteCottonPackingMaterial);

export default router;
