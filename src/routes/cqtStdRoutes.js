import express from "express";
import {
  getCQTSTDList,
  getCQTSTDById,
  createCQTSTD,
  updateCQTSTD,
  deleteCQTSTD,
  getCQTSTDOptions,
} from "../controllers/cqtStd.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Quality Test STD master CRUD (frmCottonQualityTestSTD)
router.get("/options", authenticate, getCQTSTDOptions); // CQT parameter lists
router.get("/lists", authenticate, getCQTSTDList);
router.get("/list/:cqtStdCode", authenticate, getCQTSTDById);
router.post("/create", authenticate, createCQTSTD);
router.put("/update/:cqtStdCode", authenticate, updateCQTSTD);
router.delete("/delete/:cqtStdCode", authenticate, deleteCQTSTD);

export default router;
