import express from "express";
import {
  getOptions,
  getList,
  create,
  update,
  remove,
} from "../controllers/clOpening.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// CL Opening Entry (frmCLOpeningEntry / frmCLOpeningEntryDetails)
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.post("/create", authenticate, create);
router.put("/update/:clCode", authenticate, update);
router.delete("/delete/:clYear/:employeeCode", authenticate, remove);

export default router;
