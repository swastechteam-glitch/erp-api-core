import express from "express";
import { getOptions, getPayPeriods, getGrid, save } from "../controllers/payrollTransactionOverall.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Earning And Deduction (frmPayRollTransection_OverAll)
router.get("/options", authenticate, getOptions);
router.get("/pay-periods", authenticate, getPayPeriods);
router.get("/grid", authenticate, getGrid);
router.post("/save", authenticate, save);

export default router;
