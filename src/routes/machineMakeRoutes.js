import express from "express";
import {
  getMachineMakeList,
  getMachineMakeById,
  createMachineMake,
  updateMachineMake,
  deleteMachineMake,
} from "../controllers/machineMake.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Machine Make master CRUD (frmMachineMake)
router.get("/lists", authenticate, getMachineMakeList);
router.get("/list/:machineMakeCode", authenticate, getMachineMakeById);
router.post("/create", authenticate, createMachineMake);
router.put("/update/:machineMakeCode", authenticate, updateMachineMake);
router.delete("/delete/:machineMakeCode", authenticate, deleteMachineMake);

export default router;
