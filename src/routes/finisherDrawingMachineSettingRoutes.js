import express from "express";
import {
  getFinisherDrawingMachineSettingOptions,
  getFinisherDrawingMachineSettingList,
  getFinisherDrawingMachineSettingById,
  createFinisherDrawingMachineSetting,
  updateFinisherDrawingMachineSetting,
  deleteFinisherDrawingMachineSetting,
} from "../controllers/finisherDrawingMachineSetting.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Finisher Drawing Machine Setting master CRUD
router.get("/options", authenticate, getFinisherDrawingMachineSettingOptions);
router.get("/lists", authenticate, getFinisherDrawingMachineSettingList);
router.get("/list/:fdrwMachineSettingCode", authenticate, getFinisherDrawingMachineSettingById);
router.post("/create", authenticate, createFinisherDrawingMachineSetting);
router.put("/update/:fdrwMachineSettingCode", authenticate, updateFinisherDrawingMachineSetting);
router.delete("/delete/:fdrwMachineSettingCode", authenticate, deleteFinisherDrawingMachineSetting);

export default router;
