import express from "express";
import {
  getOptions,
  getOptionsDirect,
  getItemLastPurchase,
  getNextNo,
  getPending,
  getList,
  getById,
  getItemSupplierHistory,
  create,
  update,
  remove,
} from "../controllers/purchaseOrder.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Purchase Order (frmPurchaseOrder / frmPurchaseAdviceDetails)
router.get("/options", authenticate, getOptions);
// Purchase Order - Direct (frmPurchaseOrderDirect): one-shot options incl. the
// inline item / cost-head / department / machine / employee lookups.
router.get("/options-direct", authenticate, getOptionsDirect);
router.get("/item-last-purchase/:itemCode", authenticate, getItemLastPurchase);
router.get("/next-no", authenticate, getNextNo);
router.get("/pending", authenticate, getPending);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
// "Last 10 Suppliers" history for an item (frmItemSupplierHistory) — reusable.
router.get(
  "/item-supplier-history/:itemCode",
  authenticate,
  getItemSupplierHistory,
);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
