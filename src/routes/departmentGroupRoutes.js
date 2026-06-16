import express from "express";
import {
  getDepartmentGroupList,
  getDepartmentGroupById,
  createDepartmentGroup,
  updateDepartmentGroup,
  deleteDepartmentGroup,
} from "../controllers/departmentGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Department Group master CRUD (frmDepartmentGroup)
router.get("/lists", authenticate, getDepartmentGroupList);
router.get("/list/:departmentGroupCode", authenticate, getDepartmentGroupById);
router.post("/create", authenticate, createDepartmentGroup);
router.put("/update/:departmentGroupCode", authenticate, updateDepartmentGroup);
router.delete("/delete/:departmentGroupCode", authenticate, deleteDepartmentGroup);

export default router;
