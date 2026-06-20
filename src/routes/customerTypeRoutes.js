import express from "express";
import {
  getCustomerTypeList,
  getCustomerTypeById,
  createCustomerType,
  updateCustomerType,
  deleteCustomerType,
} from "../controllers/customerType.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Customer Type master CRUD (frmCustomerType)
router.get("/lists", authenticate, getCustomerTypeList);
router.get("/list/:customerTypeCode", authenticate, getCustomerTypeById);
router.post("/create", authenticate, createCustomerType);
router.put("/update/:customerTypeCode", authenticate, updateCustomerType);
router.delete("/delete/:customerTypeCode", authenticate, deleteCustomerType);

export default router;
