import express from "express";
import {
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/spinningStopReason.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Spinning Stoppage Reason Entry master CRUD (frmSpinningStopReason / ...Details)
router.get("/lists", authenticate, getList);
router.get("/list/:spgDateCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:spgDateCode", authenticate, update);
router.delete("/delete/:spgDateCode", authenticate, remove);

export default router;
