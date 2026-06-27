import express from "express";
import {
  getOptions,
  getNextNo,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/ycpProduction.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// YCP Production Entry (frmYCPProduction / frmYCPProductionDetails)
router.get("/options", authenticate, getOptions);
router.get("/next-no", authenticate, getNextNo);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
