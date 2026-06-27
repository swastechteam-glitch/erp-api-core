import express from "express";
import {
  getOptions,
  getMachines,
  getActivities,
  getBindNo,
  getPendings,
  getPending,
  getList,
  getById,
  create,
  update,
  createBulk,
  remove,
} from "../controllers/workOrder.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Electrical / Mechanical Work Order Complete (frmWorkOrder). ?serviceType=M
// reuses it for the Mechanical menu; default is Electrical ('E').
router.get("/options", authenticate, getOptions);
router.get("/machines", authenticate, getMachines);
router.get("/activities", authenticate, getActivities);
router.get("/bind-no", authenticate, getBindNo);
router.get("/pendings", authenticate, getPendings);
router.get("/pending/:sbCode", authenticate, getPending);
router.get("/lists", authenticate, getList);
router.get("/list/:workOrderCode", authenticate, getById);
router.post("/create", authenticate, create);
router.post("/create-bulk", authenticate, createBulk);
router.put("/update/:workOrderCode", authenticate, update);
router.delete("/delete/:workOrderCode", authenticate, remove);

export default router;
