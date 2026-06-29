import express from "express";
import {
  getYarnBagNoGroupList,
  getYarnBagNoGroupById,
  createYarnBagNoGroup,
  updateYarnBagNoGroup,
  deleteYarnBagNoGroup,
} from "../controllers/yarnBagNoGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Bag No Group master CRUD (frmYarnBagNoGroup / "Yarn Bag No Group" screen)
router.get("/lists", authenticate, getYarnBagNoGroupList);
router.get("/list/:yarnBagNoGroupCode", authenticate, getYarnBagNoGroupById);
router.post("/create", authenticate, createYarnBagNoGroup);
router.put("/update/:yarnBagNoGroupCode", authenticate, updateYarnBagNoGroup);
router.delete("/delete/:yarnBagNoGroupCode", authenticate, deleteYarnBagNoGroup);

export default router;
