import express from "express";
import {
  getOptions,
  getMachines,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/machineTapeCut.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Machine Tape Cut (frmMachineTapeCut) — single-table header entry, Mechanical only.
router.get("/options", authenticate, getOptions);
router.get("/machines", authenticate, getMachines);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
