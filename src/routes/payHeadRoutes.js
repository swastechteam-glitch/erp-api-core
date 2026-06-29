import express from "express";
import {
  getOptions,
  getGroups,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/payHead.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Pay Head master CRUD (frmPayHead / frmPayHeadDetails)
router.get("/options", authenticate, getOptions);
router.get("/groups/:typeCode", authenticate, getGroups);
router.get("/lists", authenticate, getList);
router.get("/list/:payHeadCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:payHeadCode", authenticate, update);
router.delete("/delete/:payHeadCode", authenticate, remove);

export default router;
