import express from "express";
import {
  getVehicleCapacityList,
  getVehicleCapacityById,
  createVehicleCapacity,
  updateVehicleCapacity,
  deleteVehicleCapacity,
} from "../controllers/vehicleCapacity.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Vehicle Capacity master CRUD (frmVehicleCapacity)
router.get("/lists", authenticate, getVehicleCapacityList);
router.get("/list/:vehicleCapacityCode", authenticate, getVehicleCapacityById);
router.post("/create", authenticate, createVehicleCapacity);
router.put("/update/:vehicleCapacityCode", authenticate, updateVehicleCapacity);
router.delete("/delete/:vehicleCapacityCode", authenticate, deleteVehicleCapacity);

export default router;
