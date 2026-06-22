import express from "express";
import {
  getOptions,
  getNextNo,
  getLotStock,
  getBalesStock,
  getPreLoad,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/cottonMixingIssueRequisition.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Mixing Issue Requisition (frmCottonMixingIssue_Requisition_New)
router.get("/options", authenticate, getOptions);
router.get("/next-no", authenticate, getNextNo);
router.get("/lot-stock", authenticate, getLotStock);
router.get("/bales-stock/:arrivalCode", authenticate, getBalesStock);
router.get("/pre-load", authenticate, getPreLoad);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
