import express from "express";
import { getOptions, list, save, remove } from "../controllers/onDutyEntry.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// On Duty Entry (frmOnDutyEntry / frmOnDutyEntryDetails)
router.get("/options", authenticate, getOptions);
router.get("/list", authenticate, list);
router.post("/save", authenticate, save);
router.delete("/:onDutyEntryCode", authenticate, remove);

export default router;
