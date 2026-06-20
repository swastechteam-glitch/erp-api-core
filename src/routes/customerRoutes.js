import express from "express";
import {
  getCustomerList,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerOptions,
} from "../controllers/customer.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Customer master CRUD (frmCustomer)
router.get("/options", authenticate, getCustomerOptions); // dropdown lookups
router.get("/lists", authenticate, getCustomerList);
router.get("/list/:customerCode", authenticate, getCustomerById);
router.post("/create", authenticate, createCustomer);
router.put("/update/:customerCode", authenticate, updateCustomer);
router.delete("/delete/:customerCode", authenticate, deleteCustomer);

export default router;
