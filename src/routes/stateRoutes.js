import express from "express";
import {
  getStateList,
  getStateById,
  createState,
  updateState,
  deleteState,
} from "../controllers/state.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// State master CRUD (frmState)
router.get("/lists", authenticate, getStateList);
router.get("/list/:stateCode", authenticate, getStateById);
router.post("/create", authenticate, createState);
router.put("/update/:stateCode", authenticate, updateState);
router.delete("/delete/:stateCode", authenticate, deleteState);

export default router;
