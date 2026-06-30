import express from "express";
import {
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/empGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Employee Group master CRUD (frmEmpGroup / frmEmpGroupDetails)
router.get("/lists", authenticate, getList);
router.get("/list/:empGroupCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:empGroupCode", authenticate, update);
router.delete("/delete/:empGroupCode", authenticate, remove);

export default router;
