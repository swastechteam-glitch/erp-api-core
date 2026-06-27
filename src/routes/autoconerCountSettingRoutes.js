import express from "express";
import {
  getOptions,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/autoconerCountSetting.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Autoconer Count Setting master CRUD (frmAutoconerCountSetting / ...Details)
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.get("/list/:acCountSettingCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:acCountSettingCode", authenticate, update);
router.delete("/delete/:acCountSettingCode", authenticate, remove);

export default router;
