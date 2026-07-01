import express from "express";
import { getList, getCompany, getPhoto } from "../controllers/newJoinerPass.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// New Joiner Pass (rptNewJoinerPass)
router.get("/list", authenticate, getList);
router.get("/company", authenticate, getCompany);
router.get("/photo/:employeeCode", authenticate, getPhoto);

export default router;
