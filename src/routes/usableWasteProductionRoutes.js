import express from "express";
import {
  getOptions,
  getNextBaleNo,
  getList,
  getById,
  createUsableWasteProduction,
  updateUsableWasteProduction,
  deleteUsableWasteProduction,
} from "../controllers/usableWasteProduction.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Usable Waste Production entry (frmUsableWasteProduction / frmUsableWasteProductionDetails)
router.get("/options", authenticate, getOptions);
router.get("/next-bale-no", authenticate, getNextBaleNo);
router.get("/lists", authenticate, getList);
router.get("/list/:usableWasteBaleCode", authenticate, getById);
router.post("/create", authenticate, createUsableWasteProduction);
router.put("/update/:usableWasteBaleCode", authenticate, updateUsableWasteProduction);
router.delete("/delete/:usableWasteBaleCode", authenticate, deleteUsableWasteProduction);

export default router;
