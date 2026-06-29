import express from "express";
import {
  getOptions,
  deptPreload, deptMeta, deptList, deptOne, deptSave, deptDelete,
  slotPreload, slotList, slotOne, slotSave, slotDelete,
  dayList, dayOne, daySave, dayDelete,
  solarPreload, solarList, solarOne, solarSave, solarDelete,
  gensetList, gensetOne, gensetSave, gensetDelete,
  compressorPreload, compressorList, compressorOne, compressorSave, compressorDelete,
} from "../controllers/electricalReading.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Electrical Reading Entry (frmElectricalReadingEntry) — multi-tab reading screen.
router.get("/options", authenticate, getOptions);

// Department Wise
router.get("/dept/preload", authenticate, deptPreload);
router.get("/dept/meta", authenticate, deptMeta);
router.get("/dept/list", authenticate, deptList);
router.get("/dept/:code", authenticate, deptOne);
router.post("/dept/save", authenticate, deptSave);
router.delete("/dept/:code", authenticate, deptDelete);

// Slot Wise
router.get("/slot/preload", authenticate, slotPreload);
router.get("/slot/list", authenticate, slotList);
router.get("/slot/:code", authenticate, slotOne);
router.post("/slot/save", authenticate, slotSave);
router.delete("/slot/:code", authenticate, slotDelete);

// Day Wise (EB Reading Day Wise)
router.get("/daywise/list", authenticate, dayList);
router.get("/daywise/:code", authenticate, dayOne);
router.post("/daywise/save", authenticate, daySave);
router.delete("/daywise/:code", authenticate, dayDelete);

// Solar Reading
router.get("/solar/preload", authenticate, solarPreload);
router.get("/solar/list", authenticate, solarList);
router.get("/solar/:code", authenticate, solarOne);
router.post("/solar/save", authenticate, solarSave);
router.delete("/solar/:code", authenticate, solarDelete);

// Genset Reading
router.get("/genset/list", authenticate, gensetList);
router.get("/genset/:code", authenticate, gensetOne);
router.post("/genset/save", authenticate, gensetSave);
router.delete("/genset/:code", authenticate, gensetDelete);

// Compressor Reading
router.get("/compressor/preload", authenticate, compressorPreload);
router.get("/compressor/list", authenticate, compressorList);
router.get("/compressor/:code", authenticate, compressorOne);
router.post("/compressor/save", authenticate, compressorSave);
router.delete("/compressor/:code", authenticate, compressorDelete);

export default router;
