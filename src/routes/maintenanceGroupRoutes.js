import express from "express";
import {
  getMaintenanceGroupList,
  getMaintenanceGroupById,
  createMaintenanceGroup,
  updateMaintenanceGroup,
  deleteMaintenanceGroup,
} from "../controllers/maintenanceGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Maintenance Group master CRUD (frmMaintenanceGroup)
router.get("/lists", authenticate, getMaintenanceGroupList);
router.get("/list/:maintenanceGroupCode", authenticate, getMaintenanceGroupById);
router.post("/create", authenticate, createMaintenanceGroup);
router.put("/update/:maintenanceGroupCode", authenticate, updateMaintenanceGroup);
router.delete("/delete/:maintenanceGroupCode", authenticate, deleteMaintenanceGroup);

export default router;
