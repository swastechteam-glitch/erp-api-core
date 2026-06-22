import express from "express";
import {
  getOptions,
  getPending,
  getDetail,
  approve,
} from "../controllers/cottonWeighmentApproval.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Weighment Approval (frmCottonWeighmentApproval)
router.get("/options", authenticate, getOptions);
router.get("/pending", authenticate, getPending);
router.get("/detail/:code", authenticate, getDetail);
router.put("/approve/:code", authenticate, approve);

export default router;
