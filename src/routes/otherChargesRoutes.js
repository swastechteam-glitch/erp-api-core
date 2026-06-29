import express from "express";
import {
  getOtherChargesList,
  getOtherChargesById,
  createOtherCharges,
  updateOtherCharges,
  deleteOtherCharges,
} from "../controllers/otherCharges.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Other Charges master CRUD (frmOtherCharges / frmOtherChargesDetails)
router.get("/lists", authenticate, getOtherChargesList);
router.get("/list/:otherChargesCode", authenticate, getOtherChargesById);
router.post("/create", authenticate, createOtherCharges);
router.put("/update/:otherChargesCode", authenticate, updateOtherCharges);
router.delete("/delete/:otherChargesCode", authenticate, deleteOtherCharges);

export default router;
