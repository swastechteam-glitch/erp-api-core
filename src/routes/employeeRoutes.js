import express from "express";
import {
  getOptions,
  getDesignations,
  getVehicles,
  getShifts,
  getRooms,
  getDistricts,
  getGrades,
  getNextId,
  getForm12No,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/employee.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Employee master CRUD (frmEmployee / frmEmployeeDetails)
router.get("/options", authenticate, getOptions);
router.get("/designations/:departmentCode", authenticate, getDesignations);
router.get("/vehicles/:routeCode", authenticate, getVehicles);
router.get("/shifts/:shiftGroupCode", authenticate, getShifts);
router.get("/rooms/:hostelTypeCode", authenticate, getRooms);
router.get("/districts/:stateCode", authenticate, getDistricts);
router.get("/grades/:empCategoryCode", authenticate, getGrades);
router.get("/next-id/:empGroupCode", authenticate, getNextId);
router.get("/form12/:empGroupCode", authenticate, getForm12No);
router.get("/lists", authenticate, getList);
router.get("/list/:employeeCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:employeeCode", authenticate, update);
router.delete("/delete/:employeeCode", authenticate, remove);

export default router;
