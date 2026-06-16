import express from "express";
import {
  getGodownList,
  getGodownById,
  createGodown,
  updateGodown,
  deleteGodown,
} from "../controllers/godown.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Godown master CRUD (frmGodown)
router.get("/lists", authenticate, getGodownList);
router.get("/list/:godownCode", authenticate, getGodownById);
router.post("/create", authenticate, createGodown);
router.put("/update/:godownCode", authenticate, updateGodown);
router.delete("/delete/:godownCode", authenticate, deleteGodown);

export default router;
