import express from "express";
import {
  getOptions,
  getMachines,
  getJobCardNo,
  getPendings,
  getActivityItems,
  getStock,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/electricalSchedule.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Electrical / Mechanical Schedule Entry (frmSchedule). Pass ?serviceType=M to
// reuse this for the Mechanical schedule menu; default is Electrical ('E').
router.get("/options", authenticate, getOptions);
router.get("/machines", authenticate, getMachines);
router.get("/job-card-no", authenticate, getJobCardNo);
router.get("/pendings", authenticate, getPendings);
router.get("/activity-items", authenticate, getActivityItems);
router.get("/stock", authenticate, getStock);
router.get("/lists", authenticate, getList);
router.get("/list/:sbCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:sbCode", authenticate, update);
router.delete("/delete/:sbCode", authenticate, remove);

export default router;
