import express from "express";
import {
  getCostHeadList,
  getCostHeadById,
  createCostHead,
  updateCostHead,
  deleteCostHead,
} from "../controllers/costHead.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cost Head master CRUD (frmCostHead)
router.get("/lists", authenticate, getCostHeadList);
router.get("/list/:costHeadCode", authenticate, getCostHeadById);
router.post("/create", authenticate, createCostHead);
router.put("/update/:costHeadCode", authenticate, updateCostHead);
router.delete("/delete/:costHeadCode", authenticate, deleteCostHead);

export default router;
