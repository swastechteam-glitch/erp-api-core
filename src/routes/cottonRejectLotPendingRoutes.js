import express from "express";
import {
  getOptions,
  getPendings,
  getDetails,
  getList,
  approve,
  reject,
  remove,
} from "../controllers/cottonRejectLotPending.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// RawMaterial Reject Lot Pending Approval / MD CQT Approval (frmCottonRejectLotPending)
router.get("/options", authenticate, getOptions);
router.get("/pendings", authenticate, getPendings);
router.get("/details/:code", authenticate, getDetails);
router.get("/lists", authenticate, getList);
router.put("/approve/:code", authenticate, approve);
router.put("/reject/:code", authenticate, reject);
router.delete("/delete/:approvalCode", authenticate, remove);

export default router;
