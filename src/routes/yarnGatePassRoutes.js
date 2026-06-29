import express from "express";
import { getList, getReport } from "../controllers/yarnGatePass.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Gate Pass — View / Print (frmYarnGatePassPrint).
router.get("/lists", authenticate, getList);                    // gate passes
router.get("/report/:gatePassNo", authenticate, getReport);     // printable gate pass

export default router;
