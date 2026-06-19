import express from "express";
import {
  getBreakdownList,
  getBreakdownById,
  createBreakdown,
  updateBreakdown,
  deleteBreakdown,
} from "../controllers/typeOfBreakdown.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Type Of Break Downs master (frmTypeOfBreakDowns)
router.get("/lists", authenticate, getBreakdownList);
router.get("/list/:breakDownMasterCode", authenticate, getBreakdownById);
router.post("/create", authenticate, createBreakdown);
router.put("/update/:breakDownMasterCode", authenticate, updateBreakdown);
router.delete("/delete/:breakDownMasterCode", authenticate, deleteBreakdown);

export default router;
