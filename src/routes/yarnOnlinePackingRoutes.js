import express from "express";
import {
  getCounts,
  getNextBagNo,
  getList,
  create,
  update,
  remove,
} from "../controllers/yarnOnlinePacking.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// On Line Packing (frmYarnProductionEntry_OnLine / "On Line Packing" screen).
router.get("/counts", authenticate, getCounts);          // fixing counts for date (+ box packings)
router.get("/next-bag-no", authenticate, getNextBagNo);  // auto bag number
router.get("/lists", authenticate, getList);             // last entries + count-wise + total
router.post("/create", authenticate, create);            // save one bag
router.put("/update/:productionNo", authenticate, update); // edit one saved bag
router.delete("/:productionNo", authenticate, remove);   // delete one saved bag

export default router;
