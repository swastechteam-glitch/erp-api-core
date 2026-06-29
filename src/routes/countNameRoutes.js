import express from "express";
import {
  getCountNameList,
  getCountNameById,
  createCountName,
  updateCountName,
  deleteCountName,
  getCountGroupOptions,
} from "../controllers/countName.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Count Name master CRUD (frmCountName / "Count Details" screen)
router.get("/count-groups", authenticate, getCountGroupOptions);
router.get("/lists", authenticate, getCountNameList);
router.get("/list/:countNameCode", authenticate, getCountNameById);
router.post("/create", authenticate, createCountName);
router.put("/update/:countNameCode", authenticate, updateCountName);
router.delete("/delete/:countNameCode", authenticate, deleteCountName);

export default router;
