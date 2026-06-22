import express from "express";
import {
  getCottonArrivalList,
  getCottonArrivalById,
  getCottonArrivalOptions,
  getCpoPending,
  getCpoById,
  getGateEntries,
  getWeighBridges,
  getMillLotNo,
  createCottonArrival,
  updateCottonArrival,
  deleteCottonArrival,
} from "../controllers/cottonArrival.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Arrival / GRN (frmCottonArrival)
router.get("/options", authenticate, getCottonArrivalOptions);
router.get("/cpo-pending", authenticate, getCpoPending);
router.get("/cpo/:code", authenticate, getCpoById);
router.get("/gate-entries", authenticate, getGateEntries);
router.get("/weigh-bridges", authenticate, getWeighBridges);
router.get("/mill-lot-no", authenticate, getMillLotNo);
router.get("/lists", authenticate, getCottonArrivalList);
router.get("/list/:code", authenticate, getCottonArrivalById);
router.post("/create", authenticate, createCottonArrival);
router.put("/update/:code", authenticate, updateCottonArrival);
router.delete("/delete/:code", authenticate, deleteCottonArrival);

export default router;
