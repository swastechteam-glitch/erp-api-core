import express from "express";
import {
  getOptions,
  getInwardSuppliers,
  getPending,
  getGatePendings,
  getNextNo,
  getList,
  getById,
  create,
  update,
  remove,
  getDirectRequisitions,
  getDirectRequisitionItems,
  getDirectItems,
  getDirectStock,
} from "../controllers/inward.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Inward / Purchase Order Received (frmPurchaseOrderReceivedMultiPO + ...Details).
router.get("/options", authenticate, getOptions);
router.get("/suppliers", authenticate, getInwardSuppliers);
router.get("/pending", authenticate, getPending);
router.get("/gate-pendings", authenticate, getGatePendings);
router.get("/next-no", authenticate, getNextNo);
// Inward Direct (Without PO) — additive lookups (frmInwardWithOutPO_New).
router.get("/direct/requisitions", authenticate, getDirectRequisitions);
router.get("/direct/requisition-items", authenticate, getDirectRequisitionItems);
router.get("/direct/items", authenticate, getDirectItems);
router.get("/direct/stock", authenticate, getDirectStock);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
