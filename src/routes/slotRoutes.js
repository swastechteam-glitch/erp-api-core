import express from "express";
import {
  getSlotList,
  getSlotById,
  createSlot,
  updateSlot,
  deleteSlot,
} from "../controllers/slot.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Slot master CRUD (frmSlot)
router.get("/lists", authenticate, getSlotList);
router.get("/list/:slotCode", authenticate, getSlotById);
router.post("/create", authenticate, createSlot);
router.put("/update/:slotCode", authenticate, updateSlot);
router.delete("/delete/:slotCode", authenticate, deleteSlot);

export default router;
