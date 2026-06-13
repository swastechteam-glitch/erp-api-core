import express from "express";
import { getSchedulePendApproval } from "../controllers/mechanical.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";


const router = express.Router();

router.get('/schedule-pend-approvals/list',authenticate, getSchedulePendApproval);


export default router;
