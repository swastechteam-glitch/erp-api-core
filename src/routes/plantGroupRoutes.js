import express from "express";
import {
  getPlantGroupList,
  getPlantGroupById,
  createPlantGroup,
  updatePlantGroup,
  deletePlantGroup,
} from "../controllers/plantGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Plant Group master CRUD (frmPlantGroup)
router.get("/lists", authenticate, getPlantGroupList);
router.get("/list/:plantGroupCode", authenticate, getPlantGroupById);
router.post("/create", authenticate, createPlantGroup);
router.put("/update/:plantGroupCode", authenticate, updatePlantGroup);
router.delete("/delete/:plantGroupCode", authenticate, deletePlantGroup);

export default router;
