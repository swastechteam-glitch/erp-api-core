import express from "express";
import {
  getEBRateList,
  getEBRateById,
  createEBRate,
  updateEBRate,
  deleteEBRate,
} from "../controllers/ebRate.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// EB Rate master CRUD (frmEBRate)
router.get("/lists", authenticate, getEBRateList);
router.get("/list/:ebRateCode", authenticate, getEBRateById);
router.post("/create", authenticate, createEBRate);
router.put("/update/:ebRateCode", authenticate, updateEBRate);
router.delete("/delete/:ebRateCode", authenticate, deleteEBRate);

export default router;
