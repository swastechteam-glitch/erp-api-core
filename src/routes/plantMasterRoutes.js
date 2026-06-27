import express from "express";
import {
  getPlantMasterList,
  getPlantMasterById,
  createPlantMaster,
  updatePlantMaster,
  deletePlantMaster,
} from "../controllers/plantMaster.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Plant master CRUD (frmPlantMaster)
router.get("/lists", authenticate, getPlantMasterList);
router.get("/list/:plantCode", authenticate, getPlantMasterById);
router.post("/create", authenticate, createPlantMaster);
router.put("/update/:plantCode", authenticate, updatePlantMaster);
router.delete("/delete/:plantCode", authenticate, deletePlantMaster);

export default router;
