import express from "express";
import { getOptions, employeeDetail, save } from "../controllers/vacationEntry.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Vacation Entry (frmVacationEntry)
router.get("/options", authenticate, getOptions);
router.get("/employee-detail/:employeeCode", authenticate, employeeDetail);
router.post("/save", authenticate, save);

export default router;
