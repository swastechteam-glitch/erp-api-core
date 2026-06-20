import express from "express";
import {
  getCottonCountList,
  getCottonCountById,
  createCottonCount,
  updateCottonCount,
  deleteCottonCount,
} from "../controllers/cottonCount.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Count master CRUD (frmCottonCount)
router.get("/lists", authenticate, getCottonCountList);
router.get("/list/:cottonCountCode", authenticate, getCottonCountById);
router.post("/create", authenticate, createCottonCount);
router.put("/update/:cottonCountCode", authenticate, updateCottonCount);
router.delete("/delete/:cottonCountCode", authenticate, deleteCottonCount);

export default router;
