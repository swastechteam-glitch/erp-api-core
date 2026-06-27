import express from "express";
import {
  getOptions,
  getMachines,
  getLastDate,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/maintenanceBuffing.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Maintenance Buffing (frmMaintenanceBuffing) — single-table header entry, Mechanical only.
router.get("/options", authenticate, getOptions);
router.get("/machines", authenticate, getMachines);
router.get("/last-date", authenticate, getLastDate);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
