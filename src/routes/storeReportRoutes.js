import express from "express";
import { getStoreReports } from "../controllers/store.reports.js";
import { authenticate } from "../middleware/authMiddleware.js";


const router = express.Router();

router.get('/export', authenticate, getStoreReports);



export default router;
