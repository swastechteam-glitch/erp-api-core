import express from "express";
import {
  getOptions,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/designation.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Designation master CRUD (frmDesignation / frmDesignationDetails)
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.get("/list/:designationCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:designationCode", authenticate, update);
router.delete("/delete/:designationCode", authenticate, remove);

export default router;
