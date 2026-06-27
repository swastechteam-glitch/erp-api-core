import express from "express";
import {
  getComberMachineSettingOptions,
  getComberMachineSettingList,
  getComberMachineSettingById,
  createComberMachineSetting,
  updateComberMachineSetting,
  deleteComberMachineSetting,
} from "../controllers/comberMachineSetting.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Comber Machine Setting master CRUD (frmComberMachineSetting / ...Details)
router.get("/options", authenticate, getComberMachineSettingOptions);
router.get("/lists", authenticate, getComberMachineSettingList);
router.get("/list/:cbrMachineSettingCode", authenticate, getComberMachineSettingById);
router.post("/create", authenticate, createComberMachineSetting);
router.put("/update/:cbrMachineSettingCode", authenticate, updateComberMachineSetting);
router.delete("/delete/:cbrMachineSettingCode", authenticate, deleteComberMachineSetting);

export default router;
