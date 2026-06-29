import express from "express";
import {
  getOptions,
  getPendingSO,
  getCredit,
  getLotStock,
  getLotBags,
  getNextNo,
  getList,
  create,
  remove,
} from "../controllers/yarnInvoiceFull.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Invoice (Full) — frmFullInvoice. Literal GETs first; /:invoiceCode last.
router.get("/options", authenticate, getOptions);
router.get("/pending-so", authenticate, getPendingSO);
router.get("/credit", authenticate, getCredit);
router.get("/lot-stock", authenticate, getLotStock);
router.get("/lot-bags", authenticate, getLotBags);
router.get("/next-no", authenticate, getNextNo);
router.get("/lists", authenticate, getList);
router.post("/create", authenticate, create);
router.delete("/:invoiceCode", authenticate, remove);

export default router;
