import express from "express";
import {
  getOptions,
  getNextNo,
  getLoad,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/cottonQualityTest.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cotton Quality Test (frmCottonTest)
router.get("/options", authenticate, getOptions);
router.get("/next-no", authenticate, getNextNo);
router.get("/load/:arrivalCode", authenticate, getLoad);
router.get("/lists", authenticate, getList);
router.get("/list/:code", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:code", authenticate, update);
router.delete("/delete/:code", authenticate, remove);

export default router;
