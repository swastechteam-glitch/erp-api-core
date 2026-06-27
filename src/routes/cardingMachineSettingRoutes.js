import express from "express";
import {
  getCardingMachineSettingOptions,
  getCardingMachineSettingList,
  getCardingMachineSettingById,
  createCardingMachineSetting,
  updateCardingMachineSetting,
  deleteCardingMachineSetting,
} from "../controllers/cardingMachineSetting.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Carding Machine Setting master CRUD (frmCardingMachineSetting / ...Details)
router.get("/options", authenticate, getCardingMachineSettingOptions);
router.get("/lists", authenticate, getCardingMachineSettingList);
router.get("/list/:crdMachineSettingCode", authenticate, getCardingMachineSettingById);
router.post("/create", authenticate, createCardingMachineSetting);
router.put("/update/:crdMachineSettingCode", authenticate, updateCardingMachineSetting);
router.delete("/delete/:crdMachineSettingCode", authenticate, deleteCardingMachineSetting);

export default router;
