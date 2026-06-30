import express from "express";
import {
  getOptions,
  getPending,
  getLines,
  getRecommended,
  getAutoBags,
  scanBag,
  create,
} from "../controllers/yarnDespatchPacking.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Despatch Packing — Add (frmPackingAdd_Multi). Literal GETs first; /:param last.
router.get("/options", authenticate, getOptions);
router.get("/pending", authenticate, getPending);
router.get("/recommended", authenticate, getRecommended);
router.get("/auto", authenticate, getAutoBags);
router.get("/scan", authenticate, scanBag);
router.post("/create", authenticate, create);
router.get("/lines/:invoiceCode", authenticate, getLines);

export default router;
