import express from "express";
import {
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/hostelType.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Hostel Type master CRUD (frmHostelType / frmHostelTypeDetails)
router.get("/lists", authenticate, getList);
router.get("/list/:hostelTypeCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:hostelTypeCode", authenticate, update);
router.delete("/delete/:hostelTypeCode", authenticate, remove);

export default router;
