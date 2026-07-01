import express from "express";
import { getOptions, getGrid, save, remove } from "../controllers/lateHrs.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Late Hour Entry (frmLateHrs)
router.get("/options", authenticate, getOptions);
router.get("/grid", authenticate, getGrid);
router.post("/save", authenticate, save);
router.delete("/delete/:lateHrsCode", authenticate, remove);

export default router;
