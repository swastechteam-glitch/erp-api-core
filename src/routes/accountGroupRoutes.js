import express from "express";
import {
  getAccountGroupList,
  getAccountGroupById,
  createAccountGroup,
  updateAccountGroup,
  deleteAccountGroup,
  getAccountGroupOptions,
} from "../controllers/accountGroup.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Account Group master CRUD (frmAC_Group)
router.get("/options", authenticate, getAccountGroupOptions); // Parent Group lookup
router.get("/lists", authenticate, getAccountGroupList);
router.get("/list/:code", authenticate, getAccountGroupById);
router.post("/create", authenticate, createAccountGroup);
router.put("/update/:code", authenticate, updateAccountGroup);
router.delete("/delete/:code", authenticate, deleteAccountGroup);

export default router;
