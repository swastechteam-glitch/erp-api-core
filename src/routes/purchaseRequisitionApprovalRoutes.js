import express from "express";
import { getOptions, getPending, getDocument, approve, reject } from "../controllers/purchaseRequisitionApproval.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Purchase Requisition Approval (frmItemRequistionApproval, RequisitionType 'R').
router.get("/options", authenticate, getOptions);
router.get("/pending", authenticate, getPending);
router.get("/document/:code", authenticate, getDocument);
router.post("/approve", authenticate, approve);
router.post("/reject", authenticate, reject);

export default router;
