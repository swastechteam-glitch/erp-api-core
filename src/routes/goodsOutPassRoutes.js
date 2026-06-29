import express from "express";
import {
  getOptions,
  getBindNo,
  getInOutTypes,
  getItems,
  getRefNos,
  getRefDetails,
  create,
  getPending,
  getPendingDoc,
} from "../controllers/goodsOutPass.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Goods Out Pass (frmGoodsOutStore) — gate-out data entry.
router.get("/options", authenticate, getOptions);
router.get("/bind-no", authenticate, getBindNo);
router.get("/inout-types", authenticate, getInOutTypes);
router.get("/items", authenticate, getItems);
router.get("/ref-nos", authenticate, getRefNos);
router.get("/ref-details", authenticate, getRefDetails);
router.post("/create", authenticate, create);
router.get("/pending", authenticate, getPending);
router.get("/pending/:code", authenticate, getPendingDoc);

export default router;
