import express from "express";
import {
  getOptions,
  getNextNo,
  getPending,
  getList,
  getEmployees,
  getEmployeeById,
  getEmployeePhoto,
  getVehicleOpening,
  getRecord,
  save,
} from "../controllers/vehicleInOut.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Vehicle IN / OUT — Pass Entry (frmVehicleInOut)
router.get("/options", authenticate, getOptions);
router.get("/next-no", authenticate, getNextNo);
router.get("/pending", authenticate, getPending);
router.get("/lists", authenticate, getList);
router.get("/employees", authenticate, getEmployees);
router.get("/employee-by-id/:empId", authenticate, getEmployeeById);
router.get("/employee-photo/:employeeCode", authenticate, getEmployeePhoto);
router.get("/vehicle-opening/:vehicleCode", authenticate, getVehicleOpening);
router.get("/record/:code", authenticate, getRecord);
router.post("/save", authenticate, save);

export default router;
