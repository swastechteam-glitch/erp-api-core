import express from "express";
import {
  getOptions,
  getMachines,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/autoconerMachineSetting.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Autoconer Machine Setting (frmAutoconerMachineSetting / ...Details)
router.get("/options", authenticate, getOptions);
router.get("/machines", authenticate, getMachines);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
