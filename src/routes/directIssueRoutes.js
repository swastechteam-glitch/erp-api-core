import express from "express";
import { getOptions, getItems, getMachines, create } from "../controllers/directIssue.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Direct Issue (frmIssueLatest) — internal material issue.
router.get("/options", authenticate, getOptions);
router.get("/items", authenticate, getItems);
router.get("/machines", authenticate, getMachines);
router.post("/create", authenticate, create);

export default router;
