import express from "express";
import {
  getOptions,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/labourCommissionCategory.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Labour Commission Category master CRUD (frmLabourCommissionCategory)
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.get("/list/:departmentCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:departmentCode", authenticate, update);
router.delete("/delete/:departmentCode", authenticate, remove);

export default router;
