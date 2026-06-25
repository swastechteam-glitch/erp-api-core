import express from "express";
import {
  getOptions,
  getPendings,
  getDetail,
  approve,
} from "../controllers/cottonWeightApproval.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// RawMaterial Weight List Approval / Cotton Weight Approval (frmCottonPayment_WeightApproval)
router.get("/options", authenticate, getOptions);
router.get("/pendings", authenticate, getPendings);
router.get("/detail/:weighmentCode", authenticate, getDetail);
router.post("/approve", authenticate, approve);

export default router;
