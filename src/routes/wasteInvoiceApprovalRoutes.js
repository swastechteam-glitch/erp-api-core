import express from "express";
import {
  getOptions,
  getPending,
  getDetail,
  updateDetail,
  approve,
  reject,
} from "../controllers/wasteInvoiceApproval.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Waste Invoice Approval (frmWasteInvoiceApproval)
router.get("/options", authenticate, getOptions);
router.get("/pending", authenticate, getPending);
router.get("/detail/:code", authenticate, getDetail);
router.put("/update/:code", authenticate, updateDetail);
router.post("/approve", authenticate, approve);
router.delete("/reject/:code", authenticate, reject);

export default router;
