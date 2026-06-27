import express from "express";
import {
  getOptions,
  getItems,
  getMachines,
  getNextNo,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/itemIndent.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Item Issue Indent (frmItemIndent / frmItemRequisition_IndentDetails)
router.get("/options", authenticate, getOptions);
router.get("/items", authenticate, getItems);
router.get("/machines", authenticate, getMachines);
router.get("/next-no", authenticate, getNextNo);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
