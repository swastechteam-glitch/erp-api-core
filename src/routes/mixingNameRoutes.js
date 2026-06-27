import express from "express";
import {
  getMixingNameList,
  getMixingNameById,
  createMixingName,
  updateMixingName,
  deleteMixingName,
} from "../controllers/mixingName.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Mixing Name master CRUD (frmMixingName / frmMixingNameDetails)
router.get("/lists", authenticate, getMixingNameList);
router.get("/list/:mixingNameCode", authenticate, getMixingNameById);
router.post("/create", authenticate, createMixingName);
router.put("/update/:mixingNameCode", authenticate, updateMixingName);
router.delete("/delete/:mixingNameCode", authenticate, deleteMixingName);

export default router;
