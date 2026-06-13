import express from "express";
import { getyarnReports } from "../controllers/yarn.reports.js";
import { authenticate } from "../middleware/authMiddleware.js";


const router = express.Router();

router.get('/export', authenticate, getyarnReports);



export default router;
