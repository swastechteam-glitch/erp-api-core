import express from "express";
import {
  getOptions,
  getShifts,
  getHistory,
  save,
} from "../controllers/employeeShiftChange.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Employee Shift Group Change (frmEmployeeShiftGroupChange)
router.get("/options", authenticate, getOptions);
router.get("/shifts/:shiftGroupCode", authenticate, getShifts);
router.get("/history/:employeeCode", authenticate, getHistory);
router.post("/save", authenticate, save);

export default router;
