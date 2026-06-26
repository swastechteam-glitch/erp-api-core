import express from "express";
import {
  getOptions,
  getNextIssueNo,
  getAvailableBales,
  getList,
  getById,
  createUsableWasteIssue,
  updateUsableWasteIssue,
  deleteUsableWasteIssue,
} from "../controllers/usableWasteIssue.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Usable Waste Issue entry (frmUsableWasteItemIssue)
router.get("/options", authenticate, getOptions);
router.get("/next-issue-no", authenticate, getNextIssueNo);
router.get("/available-bales", authenticate, getAvailableBales);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, createUsableWasteIssue);
router.put("/update/:code", authenticate, updateUsableWasteIssue);
router.delete("/delete/:code", authenticate, deleteUsableWasteIssue);

export default router;
