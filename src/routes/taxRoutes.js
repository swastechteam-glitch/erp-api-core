import express from "express";
import {
  getTaxList,
  getTaxById,
  createTax,
  updateTax,
  deleteTax,
} from "../controllers/tax.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Tax master CRUD (frmTax)
router.get("/lists", authenticate, getTaxList);
router.get("/list/:taxCode", authenticate, getTaxById);
router.post("/create", authenticate, createTax);
router.put("/update/:taxCode", authenticate, updateTax);
router.delete("/delete/:taxCode", authenticate, deleteTax);

export default router;
