import express from "express";
import {
  getOptions,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/spinningFrameSetting.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Spinning Frame Setting master CRUD (frmSpinningFrameSetting / ...Details)
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.get("/list/:spgFrameSettingCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:spgFrameSettingCode", authenticate, update);
router.delete("/delete/:spgFrameSettingCode", authenticate, remove);

export default router;
