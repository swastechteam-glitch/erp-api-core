import express from "express";
import {
  getTaxTypeList,
  getTaxTypeById,
  createTaxType,
  updateTaxType,
  deleteTaxType,
  getSalesTypeOptions,
} from "../controllers/taxType.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Tax Type master CRUD (frmTaxType / "Tax Type" screen)
// Dropdown lookup (cmbSalesType) — declared before the generic /list/:code GET.
router.get("/sales-types", authenticate, getSalesTypeOptions);

router.get("/lists", authenticate, getTaxTypeList);
router.get("/list/:taxTypeCode", authenticate, getTaxTypeById);
router.post("/create", authenticate, createTaxType);
router.put("/update/:taxTypeCode", authenticate, updateTaxType);
router.delete("/delete/:taxTypeCode", authenticate, deleteTaxType);

export default router;
