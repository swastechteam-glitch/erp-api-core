import express from "express";
import {
  getVehicleList,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleOptions,
} from "../controllers/vehicle.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Vehicle master CRUD (frmVehicle)
router.get("/options", authenticate, getVehicleOptions); // dropdown lookups
router.get("/lists", authenticate, getVehicleList);
router.get("/list/:vehicleCode", authenticate, getVehicleById);
router.post("/create", authenticate, createVehicle);
router.put("/update/:vehicleCode", authenticate, updateVehicle);
router.delete("/delete/:vehicleCode", authenticate, deleteVehicle);

export default router;
