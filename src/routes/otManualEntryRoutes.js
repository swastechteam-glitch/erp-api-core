import express from "express";
import {
  getOptions,
  getGrid,
  employeeLookup,
  save,
  remove,
} from "../controllers/otManualEntry.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// OT Manual Entry (frmOTManualEntry)
router.get("/options", authenticate, getOptions);
router.get("/grid", authenticate, getGrid);
router.get("/employee-lookup", authenticate, employeeLookup);
router.post("/save", authenticate, save);
router.delete("/delete/:manualCode", authenticate, remove);

export default router;
