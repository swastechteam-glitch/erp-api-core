import express from "express";
import {
  getOptions,
  getNextNo,
  getPending,
  getNetWeight,
  approve,
  reject,
  update,
  getList,
  getById,
  remove,
} from "../controllers/cottonLotApproval.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Lot Issue Approval (frmCottonLotApproval / frmCottonLotApprovalDetails)
router.get("/options", authenticate, getOptions);
router.get("/next-no", authenticate, getNextNo);
router.get("/pending", authenticate, getPending);
router.get("/net-weight/:arrivalCode", authenticate, getNetWeight);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/approve", authenticate, approve);
router.post("/reject", authenticate, reject);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
