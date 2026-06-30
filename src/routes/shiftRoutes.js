import express from "express";
import {
  getOptions,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/shift.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Shift master CRUD (frmShift / frmShiftDetails)
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.get("/list/:shiftCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:shiftCode", authenticate, update);
router.delete("/delete/:shiftCode", authenticate, remove);

export default router;
