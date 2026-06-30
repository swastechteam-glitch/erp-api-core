import express from "express";
import {
  getList,
  getReport,
  getEntryOptions,
  getBills,
  create,
} from "../controllers/yarnGatePass.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Gate Pass — entry (frmGatePass) + view/print (frmYarnGatePassPrint).
router.get("/lists", authenticate, getList);                    // gate passes
router.get("/options", authenticate, getEntryOptions);          // vehicles / weigh bridges / next no
router.get("/bills", authenticate, getBills);                   // bills for a vehicle
router.post("/create", authenticate, create);                   // save a gate pass
router.get("/report/:gatePassNo", authenticate, getReport);     // printable gate pass

export default router;
