import express from "express";
import {
  getOptions,
  getMachines,
  getJobCardNo,
  getStock,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/breakdown.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Electrical / Mechanical Break Down Entry (frmBreakDown). ?serviceType=M reuses
// it for the Mechanical breakdown menu; default is Electrical ('E').
router.get("/options", authenticate, getOptions);
router.get("/machines", authenticate, getMachines);
router.get("/job-card-no", authenticate, getJobCardNo);
router.get("/stock", authenticate, getStock);
router.get("/lists", authenticate, getList);
router.get("/list/:sbCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:sbCode", authenticate, update);
router.delete("/delete/:sbCode", authenticate, remove);

export default router;
