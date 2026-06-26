import express from "express";
import {
  getOptions,
  getNextDCNo,
  getAvailableBales,
  getBale,
  getList,
  getById,
  createWasteDC,
  updateWasteDC,
  deleteWasteDC,
} from "../controllers/wasteDC.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Waste DC entry (frmWasteDC / frmWasteDCDetails)
router.get("/options", authenticate, getOptions);
router.get("/next-dc-no", authenticate, getNextDCNo);
router.get("/available-bales", authenticate, getAvailableBales);
router.get("/bale", authenticate, getBale);
router.get("/lists", authenticate, getList);
router.get("/list/:wasteDCCode", authenticate, getById);
router.post("/create", authenticate, createWasteDC);
router.put("/update/:wasteDCCode", authenticate, updateWasteDC);
router.delete("/delete/:wasteDCCode", authenticate, deleteWasteDC);

export default router;
