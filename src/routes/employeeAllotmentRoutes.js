import express from "express";
import { getSchedulePendApproval } from "../controllers/mechanical.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { getDepartmentAndShiftData, getEmployeeAllotmentDetails, getUniqueEmployeeAllotments } from "../controllers/employeeAllotment.controller.js";


const router = express.Router();

router.get('/department-shift-data/list',authenticate, getDepartmentAndShiftData);
router.get('/employee-allotment-details/list',authenticate, getEmployeeAllotmentDetails);
router.get('/unique-employee-allotments/list',authenticate, getUniqueEmployeeAllotments);


export default router;
