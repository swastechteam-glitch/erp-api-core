import express from "express";
import {
  getOptions,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/oeCountSetting.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// OE Count Setting master CRUD (frmOECountSetting / frmOECountSettingDetails)
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.get("/list/:spgCountSettingCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:spgCountSettingCode", authenticate, update);
router.delete("/delete/:spgCountSettingCode", authenticate, remove);

export default router;
