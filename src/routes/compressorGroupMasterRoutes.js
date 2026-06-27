import express from "express";
import {
  getCompressorGroupMasterList,
  getCompressorGroupMasterById,
  createCompressorGroupMaster,
  updateCompressorGroupMaster,
  deleteCompressorGroupMaster,
} from "../controllers/compressorGroupMaster.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Compressor Group master CRUD (frmCompressorGroupMaster)
router.get("/lists", authenticate, getCompressorGroupMasterList);
router.get("/list/:compressorGroupMasterCode", authenticate, getCompressorGroupMasterById);
router.post("/create", authenticate, createCompressorGroupMaster);
router.put("/update/:compressorGroupMasterCode", authenticate, updateCompressorGroupMaster);
router.delete("/delete/:compressorGroupMasterCode", authenticate, deleteCompressorGroupMaster);

export default router;
