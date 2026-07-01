import express from "express";
import {
  getOptions,
  getList,
  add,
  remove,
} from "../controllers/processStock.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Process Stock Entry (frmProcessStock).
router.get("/options", authenticate, getOptions);   // departments + FY start year
router.get("/lists", authenticate, getList);         // rows for month + year
router.post("/add", authenticate, add);              // upsert one row
router.delete("/:code", authenticate, remove);       // delete one row

export default router;
