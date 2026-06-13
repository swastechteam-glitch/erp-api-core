import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { millCosting } from "../controllers/report/costing/millCosting.js";

const router = express.Router();

// Costing -> OverAll Mill Costing
router.get("/mill-costing", authenticate, millCosting);

export default router;
