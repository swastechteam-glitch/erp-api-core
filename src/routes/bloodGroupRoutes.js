import express from "express";
import {
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/bloodGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Blood Group master CRUD (frmBloodGroup / frmBloodGroupDetails)
router.get("/lists", authenticate, getList);
router.get("/list/:bloodGroupCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:bloodGroupCode", authenticate, update);
router.delete("/delete/:bloodGroupCode", authenticate, remove);

export default router;
