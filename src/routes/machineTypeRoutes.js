import express from "express";
import {
  getMachineTypeList,
  getMachineTypeById,
  createMachineType,
  updateMachineType,
  deleteMachineType,
} from "../controllers/machineType.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Machine Type master CRUD (frmMachineType)
router.get("/lists", authenticate, getMachineTypeList);
router.get("/list/:machineTypeCode", authenticate, getMachineTypeById);
router.post("/create", authenticate, createMachineType);
router.put("/update/:machineTypeCode", authenticate, updateMachineType);
router.delete("/delete/:machineTypeCode", authenticate, deleteMachineType);

export default router;
