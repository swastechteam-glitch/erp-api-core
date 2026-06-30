import express from "express";
import {
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/employeeBatch.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Employee Batch master CRUD (frmEmployeeBatch / frmEmployeeBatchDetails)
router.get("/lists", authenticate, getList);
router.get("/list/:employeeBatchCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:employeeBatchCode", authenticate, update);
router.delete("/delete/:employeeBatchCode", authenticate, remove);

export default router;
