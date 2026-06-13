import express from "express";
import { getInvoiceApproval } from "../controllers/waste.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";


const router = express.Router();

router.get('/invoice-approvals/list', authenticate,getInvoiceApproval);



export default router;
