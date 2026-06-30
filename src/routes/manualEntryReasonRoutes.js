import express from "express";
import {
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/manualEntryReason.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// (Attendance) Manual Entry Reason master CRUD (frmManualEntryReason)
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
