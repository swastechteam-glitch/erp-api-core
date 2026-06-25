import express from "express";
import {
  getOptions,
  getNextNo,
  getLot,
  getList,
  create,
  update,
  remove,
} from "../controllers/cottonAllowance.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Allowance / RawMaterial Allowance (frmCottonAllowance)
router.get("/options", authenticate, getOptions);
router.get("/next-no", authenticate, getNextNo);
router.get("/lot/:arrivalCode", authenticate, getLot);
router.get("/lists", authenticate, getList);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
