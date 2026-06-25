import express from "express";
import {
  getOptions,
  getNextNo,
  getSales,
  getSaleDetail,
  getList,
  create,
  remove,
} from "../controllers/cottonSalesReturn.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Sales Return / RawMaterial Sales Return (frmCottonSalesReturn)
router.get("/options", authenticate, getOptions);
router.get("/next-no", authenticate, getNextNo);
router.get("/sales", authenticate, getSales);
router.get("/sale/:cottonSalesCode", authenticate, getSaleDetail);
router.get("/lists", authenticate, getList);
router.post("/create", authenticate, create);
router.delete("/delete/:code", authenticate, remove);

export default router;
