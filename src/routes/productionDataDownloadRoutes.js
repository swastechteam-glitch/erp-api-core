import express from "express";
import {
  getOptions,
  check,
  download,
} from "../controllers/productionDataDownload.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Production Download From Machine (frmProductionDataDownload)
router.get("/options", authenticate, getOptions);
router.post("/check", authenticate, check);
router.post("/download", authenticate, download);

export default router;
