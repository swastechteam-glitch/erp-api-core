import express from "express";
import {
  getList,
  getOne,
  getOptions,
  getReport,
  create,
  update,
  remove,
} from "../controllers/yarnDespatchAdvice.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Despatch Advice (Bag No) — frmDespatchAdviceBagNoPrint.
// Literal GETs first; /:param routes last so they don't shadow them.
router.get("/lists", authenticate, getList);                 // list of despatch advices
router.get("/options", authenticate, getOptions);            // Add/Edit form lookups
router.get("/report/:invoiceCode", authenticate, getReport); // printable advice (Details/Summary)
router.get("/list/:code", authenticate, getOne);             // load one row for Edit
router.post("/create", authenticate, create);                // add
router.put("/update/:code", authenticate, update);           // edit
router.delete("/delete/:code", authenticate, remove);        // delete

export default router;
