import express from "express";
import {
  getCQTParameterList,
  getCQTParameterById,
  createCQTParameter,
  updateCQTParameter,
  deleteCQTParameter,
} from "../controllers/cqtParameter.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton QC Test Parameter master CRUD (frmCQTParameter)
router.get("/lists", authenticate, getCQTParameterList);
router.get("/list/:cqtParameterCode", authenticate, getCQTParameterById);
router.post("/create", authenticate, createCQTParameter);
router.put("/update/:cqtParameterCode", authenticate, updateCQTParameter);
router.delete("/delete/:cqtParameterCode", authenticate, deleteCQTParameter);

export default router;
