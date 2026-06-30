import express from "express";
import {
  getOptions,
  getFromDate,
  getList,
  getRecord,
  create,
  update,
  remove,
} from "../controllers/payPeriod.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Pay Period master CRUD (frmPayPeriod / frmPayPeriodDetails)
router.get("/options", authenticate, getOptions);
router.get("/from-date/:payType", authenticate, getFromDate);
router.get("/lists", authenticate, getList);
router.get("/record/:code", authenticate, getRecord);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
