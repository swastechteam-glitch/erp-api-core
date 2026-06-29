import express from "express";
import {
  getOptions,
  getEmployeesByDate,
  getPrevEntry,
  create,
} from "../controllers/yarnFixing.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Production Fixing (frmYarnProductionFixing / "Yarn Fixing" screen).
router.get("/options", authenticate, getOptions);        // all line dropdowns
router.get("/employees", authenticate, getEmployeesByDate); // supervisor/employee by date
router.get("/prev-entry", authenticate, getPrevEntry);   // reload a day's saved lines
router.post("/create", authenticate, create);            // header + detail rows

export default router;
