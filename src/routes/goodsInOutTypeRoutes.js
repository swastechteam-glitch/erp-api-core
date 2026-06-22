import express from "express";
import {
  getGoodsInOutTypeList,
  getGoodsInOutTypeById,
  createGoodsInOutType,
  updateGoodsInOutType,
  deleteGoodsInOutType,
  getGoodsInOutTypeOptions,
} from "../controllers/goodsInOutType.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Goods In Out Type master CRUD (frmGoodsInOutType)
router.get("/options", authenticate, getGoodsInOutTypeOptions); // Material Type lookup
router.get("/lists", authenticate, getGoodsInOutTypeList);
router.get("/list/:code", authenticate, getGoodsInOutTypeById);
router.post("/create", authenticate, createGoodsInOutType);
router.put("/update/:code", authenticate, updateGoodsInOutType);
router.delete("/delete/:code", authenticate, deleteGoodsInOutType);

export default router;
