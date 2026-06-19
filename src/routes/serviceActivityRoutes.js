import express from "express";
import {
  getServiceActivityList,
  getServiceActivityById,
  getItems,
  getUoms,
  createServiceActivity,
  updateServiceActivity,
  deleteServiceActivity,
} from "../controllers/serviceActivity.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Service Activity master (frmServiceActivity)
router.get("/lists", authenticate, getServiceActivityList);
router.get("/items", authenticate, getItems);
router.get("/uoms", authenticate, getUoms);
router.get("/list/:serviceActivityCode", authenticate, getServiceActivityById);
router.post("/create", authenticate, createServiceActivity);
router.put("/update/:serviceActivityCode", authenticate, updateServiceActivity);
router.delete("/delete/:serviceActivityCode", authenticate, deleteServiceActivity);

export default router;
