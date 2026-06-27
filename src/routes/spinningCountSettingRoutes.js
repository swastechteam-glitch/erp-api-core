import express from "express";
import {
  getOptions,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/spinningCountSetting.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Spinning Count Setting master CRUD (frmSpinningCountSetting / ...Details)
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.get("/list/:spgCountSettingCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:spgCountSettingCode", authenticate, update);
router.delete("/delete/:spgCountSettingCode", authenticate, remove);

export default router;
