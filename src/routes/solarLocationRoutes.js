import express from "express";
import {
  getSolarLocationList,
  getSolarLocationById,
  createSolarLocation,
  updateSolarLocation,
  deleteSolarLocation,
} from "../controllers/solarLocation.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Solar & Wind Mill Location master CRUD (frmSolarLocation)
router.get("/lists", authenticate, getSolarLocationList);
router.get("/list/:solarLocationCode", authenticate, getSolarLocationById);
router.post("/create", authenticate, createSolarLocation);
router.put("/update/:solarLocationCode", authenticate, updateSolarLocation);
router.delete("/delete/:solarLocationCode", authenticate, deleteSolarLocation);

export default router;
