import express from "express";
import {
  getCountGroupList,
  getCountGroupById,
  createCountGroup,
  updateCountGroup,
  deleteCountGroup,
} from "../controllers/countGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Count Group master CRUD (frmCountGroup)
router.get("/lists", authenticate, getCountGroupList);
router.get("/list/:countGroupCode", authenticate, getCountGroupById);
router.post("/create", authenticate, createCountGroup);
router.put("/update/:countGroupCode", authenticate, updateCountGroup);
router.delete("/delete/:countGroupCode", authenticate, deleteCountGroup);

export default router;
