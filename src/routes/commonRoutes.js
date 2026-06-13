import express from "express";
import { getBadgeData, refreshBadgeData } from "../controllers/common.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";


const router = express.Router();

router.get('/count',authenticate, getBadgeData);
router.get('/refresh', refreshBadgeData);

export default router;
