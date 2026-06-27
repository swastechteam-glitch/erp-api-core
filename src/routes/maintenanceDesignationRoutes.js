import express from "express";
import {
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/maintenanceDesignation.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Maintenance Designation master CRUD (frmMaintenanceDesignation)
router.get("/lists", authenticate, getList);
router.get("/list/:maintenanceDesignationCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:maintenanceDesignationCode", authenticate, update);
router.delete("/delete/:maintenanceDesignationCode", authenticate, remove);

export default router;
