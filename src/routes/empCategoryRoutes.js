import express from "express";
import {
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/empCategory.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Employee Category master CRUD (frmEmpCategory / frmEmpCategoryDetails)
router.get("/lists", authenticate, getList);
router.get("/list/:empCategoryCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:empCategoryCode", authenticate, update);
router.delete("/delete/:empCategoryCode", authenticate, remove);

export default router;
