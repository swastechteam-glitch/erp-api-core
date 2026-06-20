import express from "express";
import {
  getTransporterList,
  getTransporterById,
  createTransporter,
  updateTransporter,
  deleteTransporter,
  getTransporterOptions,
} from "../controllers/transporter.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Transporter master CRUD (frmTransporter)
router.get("/options", authenticate, getTransporterOptions); // Bank lookup
router.get("/lists", authenticate, getTransporterList);
router.get("/list/:transporterCode", authenticate, getTransporterById);
router.post("/create", authenticate, createTransporter);
router.put("/update/:transporterCode", authenticate, updateTransporter);
router.delete("/delete/:transporterCode", authenticate, deleteTransporter);

export default router;
