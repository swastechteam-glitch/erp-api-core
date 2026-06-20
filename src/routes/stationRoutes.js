import express from "express";
import {
  getStationList,
  getStationById,
  createStation,
  updateStation,
  deleteStation,
  getStationOptions,
} from "../controllers/station.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Station master CRUD (frmStation)
router.get("/options", authenticate, getStationOptions); // State lookup
router.get("/lists", authenticate, getStationList);
router.get("/list/:stationCode", authenticate, getStationById);
router.post("/create", authenticate, createStation);
router.put("/update/:stationCode", authenticate, updateStation);
router.delete("/delete/:stationCode", authenticate, deleteStation);

export default router;
