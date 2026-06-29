import express from "express";
import {
  getSalesInchargeList,
  getSalesInchargeById,
  createSalesIncharge,
  updateSalesIncharge,
  deleteSalesIncharge,
} from "../controllers/salesIncharge.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Sales Incharge master CRUD (frmSupervisor / "Sales Incharge" screen)
router.get("/lists", authenticate, getSalesInchargeList);
router.get("/list/:supervisorCode", authenticate, getSalesInchargeById);
router.post("/create", authenticate, createSalesIncharge);
router.put("/update/:supervisorCode", authenticate, updateSalesIncharge);
router.delete("/delete/:supervisorCode", authenticate, deleteSalesIncharge);

export default router;
