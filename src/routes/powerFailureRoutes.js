import express from "express";
import {
  getOptions,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/powerFailure.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// EB Power Failure (frmEB_PowerFailure) — single-table header entry.
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
