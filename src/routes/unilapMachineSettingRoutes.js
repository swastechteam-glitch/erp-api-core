import express from "express";
import {
  getUnilapMachineSettingOptions,
  getUnilapMachineSettingList,
  getUnilapMachineSettingById,
  createUnilapMachineSetting,
  updateUnilapMachineSetting,
  deleteUnilapMachineSetting,
} from "../controllers/unilapMachineSetting.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Unilap Machine Setting master CRUD (frmUnilapMachineSetting / ...Details)
router.get("/options", authenticate, getUnilapMachineSettingOptions);
router.get("/lists", authenticate, getUnilapMachineSettingList);
router.get("/list/:uniMachineSettingCode", authenticate, getUnilapMachineSettingById);
router.post("/create", authenticate, createUnilapMachineSetting);
router.put("/update/:uniMachineSettingCode", authenticate, updateUnilapMachineSetting);
router.delete("/delete/:uniMachineSettingCode", authenticate, deleteUnilapMachineSetting);

export default router;
