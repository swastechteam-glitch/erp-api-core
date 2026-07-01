import express from "express";
import { getOptions, list, save } from "../controllers/holdSalary.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Salary Hold (frmHoldSalary)
router.get("/options", authenticate, getOptions);
router.get("/list", authenticate, list);
router.post("/save", authenticate, save);

export default router;
