import express from "express";
import {
  getOptions,
  getPayPeriods,
  employeeDetails,
  getGrid,
  save,
  remove,
} from "../controllers/attenManualEntryEmpWise.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Attendance Manual Entry — Employee Wise (frmAttendanceManualEntry / frmEmployeeAttendanceOffLine)
router.get("/options", authenticate, getOptions);
router.get("/pay-periods/:payTypeCode", authenticate, getPayPeriods);
router.get("/employee-details", authenticate, employeeDetails);
router.get("/grid", authenticate, getGrid);
router.post("/save", authenticate, save);
router.delete("/delete/:manualCode", authenticate, remove);

export default router;
