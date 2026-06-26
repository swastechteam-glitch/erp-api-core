import express from "express";
import {
  getOptions,
  getNextBaleNo,
  getList,
  getById,
  createWasteProduction,
  updateWasteProduction,
  deleteWasteProduction,
} from "../controllers/wasteProduction.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Waste Production entry (frmWasteProduction / frmWasteProductionDetails)
router.get("/options", authenticate, getOptions);
router.get("/next-bale-no", authenticate, getNextBaleNo);
router.get("/lists", authenticate, getList);
router.get("/list/:wasteBaleCode", authenticate, getById);
router.post("/create", authenticate, createWasteProduction);
router.put("/update/:wasteBaleCode", authenticate, updateWasteProduction);
router.delete("/delete/:wasteBaleCode", authenticate, deleteWasteProduction);

export default router;
