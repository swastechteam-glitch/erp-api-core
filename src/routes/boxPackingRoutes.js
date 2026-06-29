import express from "express";
import {
  getBoxPackingList,
  getBoxPackingById,
  createBoxPacking,
  updateBoxPacking,
  deleteBoxPacking,
} from "../controllers/boxPacking.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Box Packing master CRUD (frmBoxPacking / "Box Packing" screen)
router.get("/lists", authenticate, getBoxPackingList);
router.get("/list/:boxPackingCode", authenticate, getBoxPackingById);
router.post("/create", authenticate, createBoxPacking);
router.put("/update/:boxPackingCode", authenticate, updateBoxPacking);
router.delete("/delete/:boxPackingCode", authenticate, deleteBoxPacking);

export default router;
