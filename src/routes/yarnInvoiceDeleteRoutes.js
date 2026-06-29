import express from "express";
import { getList, remove } from "../controllers/yarnInvoiceDelete.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Invoice Delete (frmInvoiceDelete) — list + delete only.
router.get("/lists", authenticate, getList);                   // deletable invoices
router.delete("/:invoiceCode", authenticate, remove);          // delete one invoice

export default router;
