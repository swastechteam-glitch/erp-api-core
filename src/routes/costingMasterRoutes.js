import express from "express";
import {
  getCostingMasterList,
  getLatestCostingMaster,
  getCostingMasterById,
} from "../controllers/costingMaster.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Costing Master (frmCostingMaster) — read only.
router.get("/lists", authenticate, getCostingMasterList);
router.get("/latest", authenticate, getLatestCostingMaster);
router.get("/list/:costingMasterCode", authenticate, getCostingMasterById);

export default router;
