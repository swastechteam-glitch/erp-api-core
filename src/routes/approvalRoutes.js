import express from "express";
import {
  getApprovalList,
  getApprovalById,
  createApproval,
  updateApproval,
  deleteApproval,
} from "../controllers/approval.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Approval master CRUD (frmApproval)
router.get("/lists", authenticate, getApprovalList);
router.get("/list/:approvalCode", authenticate, getApprovalById);
router.post("/create", authenticate, createApproval);
router.put("/update/:approvalCode", authenticate, updateApproval);
router.delete("/delete/:approvalCode", authenticate, deleteApproval);

export default router;
