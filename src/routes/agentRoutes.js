import express from "express";
import {
  getAgentList,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgentOptions,
} from "../controllers/agent.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Agent master CRUD (frmAgent)
router.get("/options", authenticate, getAgentOptions); // State + Bank lookups
router.get("/lists", authenticate, getAgentList);
router.get("/list/:agentCode", authenticate, getAgentById);
router.post("/create", authenticate, createAgent);
router.put("/update/:agentCode", authenticate, updateAgent);
router.delete("/delete/:agentCode", authenticate, deleteAgent);

export default router;
