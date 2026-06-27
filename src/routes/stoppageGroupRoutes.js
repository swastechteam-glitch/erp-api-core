import express from "express";
import {
  getStoppageGroupList,
  getStoppageGroupById,
  createStoppageGroup,
  updateStoppageGroup,
  deleteStoppageGroup,
} from "../controllers/stoppageGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Stoppage Group master CRUD (frmStoppageGroup / frmStoppageGroupDetails)
router.get("/lists", authenticate, getStoppageGroupList);
router.get("/list/:stoppageGroupCode", authenticate, getStoppageGroupById);
router.post("/create", authenticate, createStoppageGroup);
router.put("/update/:stoppageGroupCode", authenticate, updateStoppageGroup);
router.delete("/delete/:stoppageGroupCode", authenticate, deleteStoppageGroup);

export default router;
