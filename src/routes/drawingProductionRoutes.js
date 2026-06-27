import express from "express";
import {
  getOptions,
  getMachines,
  getNextNo,
  checkExisting,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/drawingProduction.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Drawing Production Entry (frmDrawingProduction_New / ...Details)
router.get("/options", authenticate, getOptions);
router.get("/machines", authenticate, getMachines);
router.get("/next-no", authenticate, getNextNo);
router.get("/exists", authenticate, checkExisting);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
