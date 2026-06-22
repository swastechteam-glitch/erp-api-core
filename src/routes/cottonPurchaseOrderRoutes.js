import express from "express";
import {
  getCottonPurchaseOrderList,
  getCottonPurchaseOrderById,
  getCottonPurchaseOrderNextNo,
  getQualityStdParameters,
  createCottonPurchaseOrder,
  updateCottonPurchaseOrder,
  deleteCottonPurchaseOrder,
  getCottonPurchaseOrderOptions,
  getStationsByState,
} from "../controllers/cottonPurchaseOrder.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Purchase Order (frmCottonPurchaseOrder) — transaction CRUD + lookups.
router.get("/options", authenticate, getCottonPurchaseOrderOptions);
router.get("/stations", authenticate, getStationsByState); // ?stateCode= dependent list
router.get("/next-no", authenticate, getCottonPurchaseOrderNextNo);
router.get("/quality-std/:code/parameters", authenticate, getQualityStdParameters);
router.get("/lists", authenticate, getCottonPurchaseOrderList);
router.get("/list/:code", authenticate, getCottonPurchaseOrderById);
router.post("/create", authenticate, createCottonPurchaseOrder);
router.put("/update/:code", authenticate, updateCottonPurchaseOrder);
router.delete("/delete/:code", authenticate, deleteCottonPurchaseOrder);

export default router;
