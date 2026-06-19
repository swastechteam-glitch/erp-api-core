import express from "express";
import {
  getMachineList,
  getMachineById,
  getDepartmentsDropdown,
  getMachineTypesDropdown,
  getMachineMakesDropdown,
  getBranchesDropdown,
  getMainMachinesDropdown,
  createMachine,
  updateMachine,
  deleteMachine,
} from "../controllers/machine.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Machine master CRUD (frmMachine)
router.get("/lists", authenticate, getMachineList);

// Dropdown sources
router.get("/departments", authenticate, getDepartmentsDropdown);
router.get("/machine-types", authenticate, getMachineTypesDropdown);
router.get("/machine-makes", authenticate, getMachineMakesDropdown);
router.get("/branches", authenticate, getBranchesDropdown);
router.get("/main-machines", authenticate, getMainMachinesDropdown);

router.get("/list/:machineCode", authenticate, getMachineById);
router.post("/create", authenticate, createMachine);
router.put("/update/:machineCode", authenticate, updateMachine);
router.delete("/delete/:machineCode", authenticate, deleteMachine);

export default router;
