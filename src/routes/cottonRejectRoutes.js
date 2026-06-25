import express from "express";
import {
  getOptions,
  getNextNo,
  getBalesStock,
  getList,
  create,
  remove,
} from "../controllers/cottonReject.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Reject / RawMaterial Reject (frmCottonReject)
router.get("/options", authenticate, getOptions);
router.get("/next-no", authenticate, getNextNo);
router.get("/bales-stock/:arrivalCode", authenticate, getBalesStock);
router.get("/lists", authenticate, getList);
router.post("/create", authenticate, create);
router.delete("/delete/:code", authenticate, remove);

export default router;
