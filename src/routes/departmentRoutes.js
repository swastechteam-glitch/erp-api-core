import express from "express";
import {
  getDepartmentList,
  getDepartmentGroupsDropdown,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/department.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Department master CRUD (frmDepartment)
router.get("/lists", authenticate, getDepartmentList);
router.get("/department-groups", authenticate, getDepartmentGroupsDropdown);
router.get("/list/:departmentCode", authenticate, getDepartmentById);
router.post("/create", authenticate, createDepartment);
router.put("/update/:departmentCode", authenticate, updateDepartment);
router.delete("/delete/:departmentCode", authenticate, deleteDepartment);

export default router;
