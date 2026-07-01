import express from "express";
import { getOptions, getPendingIndents, pullIndent, itemHistory, create } from "../controllers/itemIssue.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Item Issue (frmIssue_New — Store Issue by Indent)
router.get("/options", authenticate, getOptions);
router.get("/pending-indents", authenticate, getPendingIndents);
router.post("/pull-indent", authenticate, pullIndent);
router.post("/item-history", authenticate, itemHistory);
router.post("/create", authenticate, create);

export default router;
