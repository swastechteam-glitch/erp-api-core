import express from "express";
import {
  getCompanyList,
  getCompanyById,
} from "../controllers/company.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Company master (frmCompanyDetails). Create/Update pending frmCompany.vb.
router.get("/lists", authenticate, getCompanyList);
router.get("/list/:companyCode", authenticate, getCompanyById);

export default router;
