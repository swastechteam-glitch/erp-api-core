import express from "express";
import { getGstDetails } from "../controllers/gst.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// GST lookup by GSTIN (auto-fill Name / Address / Pincode on the party masters).
router.get("/:gstin", authenticate, getGstDetails);

export default router;
