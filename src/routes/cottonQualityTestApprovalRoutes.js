import express from "express";
import {
  getPendings,
  getDetails,
  approve,
  reject,
} from "../controllers/cottonQualityTestApproval.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Quality Test Approval (frmCottonTestApproval)
router.get("/pendings", authenticate, getPendings);
router.get("/details/:code", authenticate, getDetails);
router.put("/approve/:code", authenticate, approve);
router.put("/reject/:code", authenticate, reject);

export default router;
