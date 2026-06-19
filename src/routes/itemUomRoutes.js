import express from "express";
import {
  getItemUomList,
  getItemUomById,
  createItemUom,
  updateItemUom,
  deleteItemUom,
} from "../controllers/itemUom.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Item Uom master CRUD (frmItemUom)
router.get("/lists", authenticate, getItemUomList);
router.get("/list/:itemUomCode", authenticate, getItemUomById);
router.post("/create", authenticate, createItemUom);
router.put("/update/:itemUomCode", authenticate, updateItemUom);
router.delete("/delete/:itemUomCode", authenticate, deleteItemUom);

export default router;
