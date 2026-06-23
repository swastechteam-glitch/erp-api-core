import express from "express";
import {
  getCostingMasterList,
  getLatestCostingMaster,
  getCostingMasterById,
  createCostingMaster,
  updateCostingMaster,
} from "../controllers/costingMaster.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Costing Master (frmCostingMaster) — list/read + add/edit snapshots.
router.get("/lists", authenticate, getCostingMasterList);
router.get("/latest", authenticate, getLatestCostingMaster);
router.post("/create", authenticate, createCostingMaster);
router.put("/update/:costingMasterCode", authenticate, updateCostingMaster);
router.get("/list/:costingMasterCode", authenticate, getCostingMasterById);

export default router;
