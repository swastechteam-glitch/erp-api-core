import express from "express";
import {
  getStoppageReasonOptions,
  getStoppageReasonList,
  getStoppageReasonById,
  createStoppageReason,
  updateStoppageReason,
  deleteStoppageReason,
} from "../controllers/stoppageReason.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Stoppage Reason master CRUD (frmStoppageReason / frmStoppageReasonDetails)
router.get("/options", authenticate, getStoppageReasonOptions);
router.get("/lists", authenticate, getStoppageReasonList);
router.get("/list/:stoppageReasonCode", authenticate, getStoppageReasonById);
router.post("/create", authenticate, createStoppageReason);
router.put("/update/:stoppageReasonCode", authenticate, updateStoppageReason);
router.delete("/delete/:stoppageReasonCode", authenticate, deleteStoppageReason);

export default router;
