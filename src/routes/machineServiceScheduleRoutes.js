import express from "express";
import {
  getBranches,
  getDepartments,
  getServiceActivities,
  getUoms,
  getItems,
  getMachines,
  getMachineSchedule,
  getActivityItems,
  saveMachineSchedule,
} from "../controllers/machineServiceSchedule.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Machine Service Schedule setup (frmMachineServiceSchedule)
router.get("/branches", authenticate, getBranches);
router.get("/departments", authenticate, getDepartments);
router.get("/service-activities", authenticate, getServiceActivities);
router.get("/uoms", authenticate, getUoms);
router.get("/items", authenticate, getItems);
router.get("/machines", authenticate, getMachines);
router.get("/machine-schedule", authenticate, getMachineSchedule);
router.get("/activity-items", authenticate, getActivityItems);
router.post("/save", authenticate, saveMachineSchedule);

export default router;
