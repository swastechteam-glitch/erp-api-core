import express from "express";
import { getOptions, emptyLoad, save, remove } from "../controllers/weighBridge.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Weigh Bridge Entry (frmWeighBridge)
router.get("/options", authenticate, getOptions);
router.get("/empty-load", authenticate, emptyLoad);
router.post("/save", authenticate, save);
router.delete("/:weighCode", authenticate, remove);

export default router;
