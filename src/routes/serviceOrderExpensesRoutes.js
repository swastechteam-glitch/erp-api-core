import express from "express";
import {
  getServiceOrderExpensesList,
  getServiceOrderExpensesById,
  createServiceOrderExpenses,
  updateServiceOrderExpenses,
  deleteServiceOrderExpenses,
} from "../controllers/serviceOrderExpenses.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Service Order Expenses master CRUD (frmServiceOrderExpenses)
router.get("/lists", authenticate, getServiceOrderExpensesList);
router.get("/list/:soExpensesCode", authenticate, getServiceOrderExpensesById);
router.post("/create", authenticate, createServiceOrderExpenses);
router.put("/update/:soExpensesCode", authenticate, updateServiceOrderExpenses);
router.delete("/delete/:soExpensesCode", authenticate, deleteServiceOrderExpenses);

export default router;
