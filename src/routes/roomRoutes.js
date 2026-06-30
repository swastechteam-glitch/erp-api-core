import express from "express";
import {
  getOptions,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/room.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Room master CRUD (frmRoom / frmRoomDetails)
router.get("/options", authenticate, getOptions);
router.get("/lists", authenticate, getList);
router.get("/list/:roomCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:roomCode", authenticate, update);
router.delete("/delete/:roomCode", authenticate, remove);

export default router;
