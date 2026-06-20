import express from "express";
import {
  getVehicleMakeList,
  getVehicleMakeById,
  createVehicleMake,
  updateVehicleMake,
  deleteVehicleMake,
} from "../controllers/vehicleMake.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Vehicle Make master CRUD (frmVehicleMake)
router.get("/lists", authenticate, getVehicleMakeList);
router.get("/list/:vehicleMakeCode", authenticate, getVehicleMakeById);
router.post("/create", authenticate, createVehicleMake);
router.put("/update/:vehicleMakeCode", authenticate, updateVehicleMake);
router.delete("/delete/:vehicleMakeCode", authenticate, deleteVehicleMake);

export default router;
