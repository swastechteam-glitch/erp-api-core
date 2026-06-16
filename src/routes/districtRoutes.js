import express from "express";
import {
  getDistrictList,
  getStatesDropdown,
  getDistrictById,
  createDistrict,
  updateDistrict,
  deleteDistrict,
} from "../controllers/district.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// District master CRUD (frmDistrict)
router.get("/lists", authenticate, getDistrictList);
router.get("/states", authenticate, getStatesDropdown);
router.get("/list/:districtCode", authenticate, getDistrictById);
router.post("/create", authenticate, createDistrict);
router.put("/update/:districtCode", authenticate, updateDistrict);
router.delete("/delete/:districtCode", authenticate, deleteDistrict);

export default router;
