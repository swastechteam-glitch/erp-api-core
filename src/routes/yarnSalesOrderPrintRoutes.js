import express from "express";
import {
  getOptions,
  getList,
  getReport,
} from "../controllers/yarnSalesOrderPrint.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Sales Order Print (frmSalesOrderPrint).
router.get("/options", authenticate, getOptions);         // customers / agents / companies
router.get("/lists", authenticate, getList);              // matching orders
router.get("/report/:soCode", authenticate, getReport);   // printable order data

export default router;
