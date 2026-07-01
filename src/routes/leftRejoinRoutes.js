import express from "express";
import {
  getOptions,
  employeeDetail,
  save,
} from "../controllers/leftRejoin.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Left And Rejoin (frmLeftRejoin / frmLeftRejoinDetails)
router.get("/options", authenticate, getOptions);
router.get("/employee-detail/:employeeCode", authenticate, employeeDetail);
router.post("/save", authenticate, save);

export default router;
