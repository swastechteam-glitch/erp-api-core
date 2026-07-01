import express from "express";
import {
  getOptions,
  getTaxTypes,
  getNextNo,
  getStock,
  getList,
  getOne,
  create,
  update,
  remove,
} from "../controllers/yarnPurchaseOrder.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Purchase Order (frmYarnPurchaseOrder / frmYarnPurchaseOrderDetails).
router.get("/options", authenticate, getOptions);     // dropdowns
router.get("/tax-types", authenticate, getTaxTypes);   // tax rows by sales type
router.get("/next-no", authenticate, getNextNo);       // auto P.O. No
router.get("/stock", authenticate, getStock);          // count-wise bag stock
router.get("/lists", authenticate, getList);           // saved purchase orders
router.post("/create", authenticate, create);          // header + count lines
router.put("/update/:code", authenticate, update);     // edit
router.delete("/:code", authenticate, remove);         // delete
router.get("/:code", authenticate, getOne);            // load one (edit) — keep last

export default router;
