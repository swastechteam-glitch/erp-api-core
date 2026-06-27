import express from "express";
import {
  getOptions,
  getPerLoad,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/prodnEmpEngaged.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Production Employee Engaged Entry (frmProdnEmpEngaged / frmProdnEmpEngagedDetails)
router.get("/options", authenticate, getOptions);
router.get("/per-load", authenticate, getPerLoad);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
