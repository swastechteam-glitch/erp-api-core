import express from "express";
import {
  getCustomerApproveList,
  getCustomerApproveById,
  createCustomerApprove,
  updateCustomerApprove,
  deleteCustomerApprove,
  getCustomerApproveOptions,
} from "../controllers/customerApprove.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Customer Approve master CRUD (frmCustomerApprove)
router.get("/options", authenticate, getCustomerApproveOptions); // dropdown lookups
router.get("/lists", authenticate, getCustomerApproveList);
router.get("/list/:customerCode", authenticate, getCustomerApproveById);
router.post("/create", authenticate, createCustomerApprove);
router.put("/update/:customerCode", authenticate, updateCustomerApprove);
router.delete("/delete/:customerCode", authenticate, deleteCustomerApprove);

export default router;
