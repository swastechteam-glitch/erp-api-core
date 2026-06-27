import express from "express";
import {
  getOptions,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/empEngaged.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Electrical / Mechanical Engagement (frmMaintenanceEmpEngaged). ?serviceType=M
// reuses it for the Mechanical menu; default is Electrical ('E').
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
