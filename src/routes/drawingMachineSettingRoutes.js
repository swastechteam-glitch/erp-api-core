import express from "express";
import {
  getDrawingMachineSettingOptions,
  getDrawingMachineSettingList,
  getDrawingMachineSettingById,
  createDrawingMachineSetting,
  updateDrawingMachineSetting,
  deleteDrawingMachineSetting,
} from "../controllers/drawingMachineSetting.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Drawing Machine Setting master CRUD (frmDrawingMachineSetting / ...Details)
router.get("/options", authenticate, getDrawingMachineSettingOptions);
router.get("/lists", authenticate, getDrawingMachineSettingList);
router.get("/list/:drwMachineSettingCode", authenticate, getDrawingMachineSettingById);
router.post("/create", authenticate, createDrawingMachineSetting);
router.put("/update/:drwMachineSettingCode", authenticate, updateDrawingMachineSetting);
router.delete("/delete/:drwMachineSettingCode", authenticate, deleteDrawingMachineSetting);

export default router;
