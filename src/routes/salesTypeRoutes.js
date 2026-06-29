import express from "express";
import {
  getSalesTypeList,
  getSalesTypeById,
  createSalesType,
  updateSalesType,
  deleteSalesType,
} from "../controllers/salesType.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Sales Type master CRUD (frmSalesType / frmSalesTypeDetails)
router.get("/lists", authenticate, getSalesTypeList);
router.get("/list/:salesTypeCode", authenticate, getSalesTypeById);
router.post("/create", authenticate, createSalesType);
router.put("/update/:salesTypeCode", authenticate, updateSalesType);
router.delete("/delete/:salesTypeCode", authenticate, deleteSalesType);

export default router;
