import express from "express";
import {
  getYarnBagNoSettingList,
  getYarnBagNoSettingById,
  createYarnBagNoSetting,
  updateYarnBagNoSetting,
  deleteYarnBagNoSetting,
  getYarnBagNoGroupOptions,
} from "../controllers/yarnBagNoSetting.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Bag No Setting master CRUD (frmYarnBagNo_Setting / "Yarn Bag No Setting").
// Group dropdown lookup declared before the generic /list/:code GET.
router.get("/groups", authenticate, getYarnBagNoGroupOptions);

router.get("/lists", authenticate, getYarnBagNoSettingList);
router.get("/list/:yarnBagNoSettingCode", authenticate, getYarnBagNoSettingById);
router.post("/create", authenticate, createYarnBagNoSetting);
router.put("/update/:yarnBagNoSettingCode", authenticate, updateYarnBagNoSetting);
router.delete("/delete/:yarnBagNoSettingCode", authenticate, deleteYarnBagNoSetting);

export default router;
