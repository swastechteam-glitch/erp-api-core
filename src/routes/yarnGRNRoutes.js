import express from "express";
import {
  getOptions,
  getNextNo,
  getBagNo,
  getPending,
  getPendingDetail,
  getList,
  create,
} from "../controllers/yarnGRN.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn GRN (Inward) (frmYarnGRN / frmYarnGRNDetails).
router.get("/options", authenticate, getOptions);                  // dropdowns
router.get("/next-no", authenticate, getNextNo);                   // auto GRN No
router.get("/bag-no", authenticate, getBagNo);                     // next bag no
router.get("/pending", authenticate, getPending);                  // pending POs (by supplier)
router.get("/pending-detail/:code", authenticate, getPendingDetail); // PO balance lines + count types
router.get("/lists", authenticate, getList);                       // saved GRNs
router.post("/create", authenticate, create);                      // header + bag lines (+ stock)

export default router;
