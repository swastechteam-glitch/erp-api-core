import express from "express";
import {
  getPowerCategoryList,
  getPowerCategoryById,
  createPowerCategory,
  updatePowerCategory,
  deletePowerCategory,
} from "../controllers/powerCategory.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Power Category master CRUD (frmPowerCategory)
router.get("/lists", authenticate, getPowerCategoryList);
router.get("/list/:powerCategoryCode", authenticate, getPowerCategoryById);
router.post("/create", authenticate, createPowerCategory);
router.put("/update/:powerCategoryCode", authenticate, updatePowerCategory);
router.delete("/delete/:powerCategoryCode", authenticate, deletePowerCategory);

export default router;
