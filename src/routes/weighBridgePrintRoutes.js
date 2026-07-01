import express from "express";
import { getOptions, list, slip, markPrinted } from "../controllers/report/weighbridge/weighBridgePrint.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Weigh Bridge ▸ Weighment Slip Print (frmWeighBridgePrint)
router.get("/options", authenticate, getOptions);       // companies
router.get("/list", authenticate, list);                // grid rows (sp_WeighBridge_DocPrint)
router.get("/slip", authenticate, slip);                // per-weighment PDF slip
router.post("/mark-printed", authenticate, markPrinted); // Printed = 1

export default router;
