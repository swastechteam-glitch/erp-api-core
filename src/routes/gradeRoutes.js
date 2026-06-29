import express from "express";
import {
  getOptions,
  getList,
  getRecord,
  create,
  update,
  remove,
} from "../controllers/grade.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Grade — Payroll Master (frmGrade / frmGradeDetails)
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.get("/record/:code", authenticate, getRecord);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
