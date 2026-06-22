import express from "express";
import {
  getCottonWeighmentList,
  getCottonWeighmentById,
  getCottonWeighmentNextNo,
  getMillLots,
  getWeighBridges,
  getCottonWeighmentOptions,
  createCottonWeighment,
  updateCottonWeighment,
  deleteCottonWeighment,
} from "../controllers/cottonWeighment.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Weighment (frmCottonWeighment)
router.get("/options", authenticate, getCottonWeighmentOptions);
router.get("/mill-lots", authenticate, getMillLots);
router.get("/weigh-bridges", authenticate, getWeighBridges);
router.get("/next-no", authenticate, getCottonWeighmentNextNo);
router.get("/lists", authenticate, getCottonWeighmentList);
router.get("/list/:code", authenticate, getCottonWeighmentById);
router.post("/create", authenticate, createCottonWeighment);
router.put("/update/:code", authenticate, updateCottonWeighment);
router.delete("/delete/:code", authenticate, deleteCottonWeighment);

export default router;
