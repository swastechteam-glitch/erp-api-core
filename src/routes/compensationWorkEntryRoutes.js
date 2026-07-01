import express from "express";
import { getOptions, list, attendanceCheck, save, remove } from "../controllers/compensationWorkEntry.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Compensation Work Entry (frmCompensationWorkEntry / frmCompensationworkEntryDetails)
router.get("/options", authenticate, getOptions);
router.get("/list", authenticate, list);
router.get("/attendance-check", authenticate, attendanceCheck);
router.post("/save", authenticate, save);
router.delete("/:compensationWorkEntryCode", authenticate, remove);

export default router;
