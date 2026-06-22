import express from "express";
import {
  getOptions,
  getMachines,
  getNextNo,
  getItemPending,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/itemRequisition.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Item Purchase Requisition (frmItemRequisition / frmItemRequisition_Details)
router.get("/options", authenticate, getOptions);
router.get("/machines", authenticate, getMachines);
router.get("/next-no", authenticate, getNextNo);
router.get("/item/:itemCode/pending", authenticate, getItemPending);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
