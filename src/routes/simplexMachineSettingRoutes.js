import express from "express";
import {
  getSimplexMachineSettingOptions,
  getSimplexMachineSettingList,
  getSimplexMachineSettingById,
  createSimplexMachineSetting,
  updateSimplexMachineSetting,
  deleteSimplexMachineSetting,
} from "../controllers/simplexMachineSetting.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Simplex Machine Setting master CRUD
router.get("/options", authenticate, getSimplexMachineSettingOptions);
router.get("/lists", authenticate, getSimplexMachineSettingList);
router.get("/list/:spxMachineSettingCode", authenticate, getSimplexMachineSettingById);
router.post("/create", authenticate, createSimplexMachineSetting);
router.put("/update/:spxMachineSettingCode", authenticate, updateSimplexMachineSetting);
router.delete("/delete/:spxMachineSettingCode", authenticate, deleteSimplexMachineSetting);

export default router;
