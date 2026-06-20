import express from "express";
import {
  getSupplierList,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierOptions,
} from "../controllers/supplier.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Supplier master CRUD (frmSupplier) — mounted at /supplier
router.get("/options", authenticate, getSupplierOptions); // State/Bank/Company lookups
router.get("/lists", authenticate, getSupplierList);
router.get("/list/:supplierCode", authenticate, getSupplierById);
router.post("/create", authenticate, createSupplier);
router.put("/update/:supplierCode", authenticate, updateSupplier);
router.delete("/delete/:supplierCode", authenticate, deleteSupplier);

export default router;
