import express from "express";
import {
  getOptions,
  getShifts,
  getEmployees,
  getGrid,
  employeeLookup,
  save,
  remove,
} from "../controllers/attenManualEntry.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Attendance Manual Entry — Shift Wise (frmAttenManualEntry)
router.get("/options", authenticate, getOptions);
router.get("/shifts", authenticate, getShifts);
router.get("/employees/:payTypeCode", authenticate, getEmployees);
router.get("/grid", authenticate, getGrid);
router.get("/employee-lookup", authenticate, employeeLookup);
router.post("/save", authenticate, save);
router.delete("/delete/:manualCode", authenticate, remove);

export default router;
