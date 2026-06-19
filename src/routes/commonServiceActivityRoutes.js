import express from "express";
import {
  getDepartmentsDropdown,
  getServiceActivities,
  getMainMachines,
  getMachineGrid,
  saveCommonUpdate,
} from "../controllers/commonServiceActivity.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Common Service Activity / Schedule Common Update (frmCommonServiceActivity)
router.get("/departments", authenticate, getDepartmentsDropdown);
router.get("/service-activities", authenticate, getServiceActivities);
router.get("/main-machines", authenticate, getMainMachines);
router.get("/machine-grid", authenticate, getMachineGrid);
router.post("/save", authenticate, saveCommonUpdate);

export default router;
