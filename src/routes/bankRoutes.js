import express from "express";
import {
  getBankList,
  getBankById,
  createBank,
  updateBank,
  deleteBank,
} from "../controllers/bank.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Bank master CRUD (frmBank)
router.get("/lists", authenticate, getBankList);
router.get("/list/:bankCode", authenticate, getBankById);
router.post("/create", authenticate, createBank);
router.put("/update/:bankCode", authenticate, updateBank);
router.delete("/delete/:bankCode", authenticate, deleteBank);

export default router;
