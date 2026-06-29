import express from "express";
import {
  getVehicleExpensesList,
  getVehicleExpensesById,
  createVehicleExpenses,
  updateVehicleExpenses,
  deleteVehicleExpenses,
} from "../controllers/vehicleExpenses.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Vehicle Expenses master CRUD (frmVehicleExpensess)
router.get("/lists", authenticate, getVehicleExpensesList);
router.get("/list/:vehicleExpensesCode", authenticate, getVehicleExpensesById);
router.post("/create", authenticate, createVehicleExpenses);
router.put("/update/:vehicleExpensesCode", authenticate, updateVehicleExpenses);
router.delete("/delete/:vehicleExpensesCode", authenticate, deleteVehicleExpenses);

export default router;
