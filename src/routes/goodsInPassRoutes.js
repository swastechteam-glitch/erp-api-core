import express from "express";
import { getOptions, getList, getDocument, storeIn, reject } from "../controllers/goodsInPass.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Goods In Pass (frmGoodsInStore) — gate-entry store-in acknowledgment.
router.get("/options", authenticate, getOptions);
router.get("/list", authenticate, getList);
router.get("/document/:code", authenticate, getDocument);
router.post("/store-in", authenticate, storeIn);
router.post("/reject", authenticate, reject);

export default router;
