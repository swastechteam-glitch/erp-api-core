import express from "express";
import {
  getGeneratorMachineGroupList,
  getGeneratorMachineGroupById,
  createGeneratorMachineGroup,
  updateGeneratorMachineGroup,
  deleteGeneratorMachineGroup,
} from "../controllers/generatorMachineGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Generator Machine Group master CRUD (frmGeneratorMachineGroup)
router.get("/lists", authenticate, getGeneratorMachineGroupList);
router.get("/list/:generatorMachineGroupCode", authenticate, getGeneratorMachineGroupById);
router.post("/create", authenticate, createGeneratorMachineGroup);
router.put("/update/:generatorMachineGroupCode", authenticate, updateGeneratorMachineGroup);
router.delete("/delete/:generatorMachineGroupCode", authenticate, deleteGeneratorMachineGroup);

export default router;
