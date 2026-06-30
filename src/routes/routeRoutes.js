import express from "express";
import {
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/route.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Route master CRUD (frmRoute / frmRouteDetails)
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
