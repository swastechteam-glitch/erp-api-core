import express from "express";
import {
  getBagColourList,
  getBagColourById,
  createBagColour,
  updateBagColour,
  deleteBagColour,
} from "../controllers/bagColour.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Bag Colour master CRUD (frmBagColour / frmBagColourDetails)
router.get("/lists", authenticate, getBagColourList);
router.get("/list/:bagColourCode", authenticate, getBagColourById);
router.post("/create", authenticate, createBagColour);
router.put("/update/:bagColourCode", authenticate, updateBagColour);
router.delete("/delete/:bagColourCode", authenticate, deleteBagColour);

export default router;
