import express from "express";
import {
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/shiftGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Shift Group master CRUD (frmShiftGroup / frmShiftGroupDetails)
router.get("/lists", authenticate, getList);
router.get("/list/:shiftGroupCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:shiftGroupCode", authenticate, update);
router.delete("/delete/:shiftGroupCode", authenticate, remove);

export default router;
