import express from "express";
import {
  getTipColourList,
  getTipColourById,
  createTipColour,
  updateTipColour,
  deleteTipColour,
} from "../controllers/tipColour.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Tip Colour master CRUD (frmTipColour / frmTipColourDetails)
router.get("/lists", authenticate, getTipColourList);
router.get("/list/:tipColourCode", authenticate, getTipColourById);
router.post("/create", authenticate, createTipColour);
router.put("/update/:tipColourCode", authenticate, updateTipColour);
router.delete("/delete/:tipColourCode", authenticate, deleteTipColour);

export default router;
