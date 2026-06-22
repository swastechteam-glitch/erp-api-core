import express from "express";
import {
  getNextNo,
  getRequisitions,
  getRequisitionDetail,
  getBalesStock,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/cottonIssue.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Issue (frmCottonIssue / frmCottonIssueDetails)
router.get("/next-no", authenticate, getNextNo);
router.get("/requisitions", authenticate, getRequisitions);
router.get("/requisition/:code", authenticate, getRequisitionDetail);
router.get("/bales-stock/:arrivalCode", authenticate, getBalesStock);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
