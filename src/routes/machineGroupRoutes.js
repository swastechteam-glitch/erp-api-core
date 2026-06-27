import express from "express";
import {
  getMachineGroupList,
  getMachineGroupById,
  createMachineGroup,
  updateMachineGroup,
  deleteMachineGroup,
} from "../controllers/machineGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// (Diesel) Machine Group master CRUD (frmMachineGroup)
router.get("/lists", authenticate, getMachineGroupList);
router.get("/list/:machineGroupCode", authenticate, getMachineGroupById);
router.post("/create", authenticate, createMachineGroup);
router.put("/update/:machineGroupCode", authenticate, updateMachineGroup);
router.delete("/delete/:machineGroupCode", authenticate, deleteMachineGroup);

export default router;
