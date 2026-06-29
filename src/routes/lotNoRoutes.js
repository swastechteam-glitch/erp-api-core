import express from "express";
import {
  getLotNoList,
  getLotNoById,
  createLotNo,
  updateLotNo,
  deleteLotNo,
  getMixingCountOptions,
} from "../controllers/lotNo.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Lot No master CRUD (frmLotNo / "Lot No" screen)
// Dropdown lookup (cmbMixingCount) declared before the generic /list/:code GET.
router.get("/mixing-counts", authenticate, getMixingCountOptions);

router.get("/lists", authenticate, getLotNoList);
router.get("/list/:lotNoCode", authenticate, getLotNoById);
router.post("/create", authenticate, createLotNo);
router.put("/update/:lotNoCode", authenticate, updateLotNo);
router.delete("/delete/:lotNoCode", authenticate, deleteLotNo);

export default router;
