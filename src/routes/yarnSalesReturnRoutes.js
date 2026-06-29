import express from "express";
import {
  getOptions,
  getNextNo,
  getBagNo,
  getList,
  getOne,
  create,
  update,
  remove,
} from "../controllers/yarnSalesReturn.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Sales Return (frmSalesReturn / frmSalesReturnDetails).
// Literal GETs first; /:param routes last so they don't shadow them.
router.get("/options", authenticate, getOptions);
router.get("/next-no", authenticate, getNextNo);
router.get("/bag-no", authenticate, getBagNo);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getOne);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
