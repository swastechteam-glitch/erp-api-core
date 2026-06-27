import express from "express";
import {
  getSolarGroupList,
  getSolarGroupById,
  createSolarGroup,
  updateSolarGroup,
  deleteSolarGroup,
} from "../controllers/solarGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Solar & Wind Mill Group master CRUD (frmSolarGroup)
router.get("/lists", authenticate, getSolarGroupList);
router.get("/list/:solarGroupCode", authenticate, getSolarGroupById);
router.post("/create", authenticate, createSolarGroup);
router.put("/update/:solarGroupCode", authenticate, updateSolarGroup);
router.delete("/delete/:solarGroupCode", authenticate, deleteSolarGroup);

export default router;
