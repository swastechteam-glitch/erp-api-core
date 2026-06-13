import express from "express";
import { getHRMReports, getReportFilters } from "../controllers/hrm.reports.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get('/export', authenticate, getHRMReports);
router.get('/filter-list', authenticate, getReportFilters);


export default router;