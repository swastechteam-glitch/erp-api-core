import express from "express";
import {
  getEmploymentList,
  getEmploymentById,
  createEmployment,
  updateEmployment,
  deleteEmployment,
} from "../controllers/employment.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Type Of Employment master CRUD (frmTypeOfEmployment / frmTypeofEmploymentDetails)
router.get("/lists", authenticate, getEmploymentList);
router.get("/list/:employmentCode", authenticate, getEmploymentById);
router.post("/create", authenticate, createEmployment);
router.put("/update/:employmentCode", authenticate, updateEmployment);
router.delete("/delete/:employmentCode", authenticate, deleteEmployment);

export default router;
