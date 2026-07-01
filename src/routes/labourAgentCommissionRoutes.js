import express from "express";
import { getOptions, getPayPeriods, getPendings, list, save, remove } from "../controllers/labourAgentCommission.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Labour Agent Commission (frmLabourAgentCommission / frmLabourAgentCommissionDetails)
router.get("/options", authenticate, getOptions);
router.get("/pay-periods", authenticate, getPayPeriods);
router.get("/pendings", authenticate, getPendings);
router.get("/list", authenticate, list);
router.post("/save", authenticate, save);
router.delete("/:lacCode", authenticate, remove);

export default router;
