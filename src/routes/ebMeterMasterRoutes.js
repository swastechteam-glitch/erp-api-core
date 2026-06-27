import express from "express";
import {
  getEBMeterList,
  getEBMeterById,
  createEBMeter,
  updateEBMeter,
  deleteEBMeter,
} from "../controllers/ebMeterMaster.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// EB Meter master CRUD (frmEBMeterMaster)
router.get("/lists", authenticate, getEBMeterList);
router.get("/list/:ebMeterCode", authenticate, getEBMeterById);
router.post("/create", authenticate, createEBMeter);
router.put("/update/:ebMeterCode", authenticate, updateEBMeter);
router.delete("/delete/:ebMeterCode", authenticate, deleteEBMeter);

export default router;
