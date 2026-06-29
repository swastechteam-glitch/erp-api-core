import express from "express";
import {
  getVehicleExpensesGroupList,
  getVehicleExpensesGroupById,
  createVehicleExpensesGroup,
  updateVehicleExpensesGroup,
  deleteVehicleExpensesGroup,
} from "../controllers/vehicleExpensesGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Vehicle Expenses Group master CRUD (frmVehicleExpensessGroup)
router.get("/lists", authenticate, getVehicleExpensesGroupList);
router.get("/list/:vehicleExpensesGroupCode", authenticate, getVehicleExpensesGroupById);
router.post("/create", authenticate, createVehicleExpensesGroup);
router.put("/update/:vehicleExpensesGroupCode", authenticate, updateVehicleExpensesGroup);
router.delete("/delete/:vehicleExpensesGroupCode", authenticate, deleteVehicleExpensesGroup);

export default router;
