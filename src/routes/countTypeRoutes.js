import express from "express";
import {
  getCountTypeList,
  getCountTypeById,
  createCountType,
  updateCountType,
  deleteCountType,
  getCountNameOptions,
  getLotNoOptions,
  getTipColourOptions,
  getBagColourOptions,
  getBagNoGroupOptions,
} from "../controllers/countType.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Count Type master CRUD (frmCountType / "Count Type" screen)
// Dropdown lookups (cmbCountName / cmbLotNo / cmbTipColour / cmbBagColour /
// cmbYarnBagNoGroup) — declared before the generic /list/:code GET.
router.get("/count-names", authenticate, getCountNameOptions);
router.get("/lot-nos", authenticate, getLotNoOptions);
router.get("/tip-colours", authenticate, getTipColourOptions);
router.get("/bag-colours", authenticate, getBagColourOptions);
router.get("/bagno-groups", authenticate, getBagNoGroupOptions);

router.get("/lists", authenticate, getCountTypeList);
router.get("/list/:countTypeCode", authenticate, getCountTypeById);
router.post("/create", authenticate, createCountType);
router.put("/update/:countTypeCode", authenticate, updateCountType);
router.delete("/delete/:countTypeCode", authenticate, deleteCountType);

export default router;
