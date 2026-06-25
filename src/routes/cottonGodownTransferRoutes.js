import express from "express";
import {
  getOptions,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/cottonGodownTransfer.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Godown Transfer (frmCottonGodownTransfer)
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
