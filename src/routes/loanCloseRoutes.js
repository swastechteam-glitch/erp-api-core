import express from "express";
import { getOptions, pending, list, save, remove } from "../controllers/loanClose.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Loan Close (frmLoanClose / frmLoanCloseDetails)
router.get("/options", authenticate, getOptions);
router.get("/pending", authenticate, pending);
router.get("/list", authenticate, list);
router.post("/save", authenticate, save);
router.delete("/:loanClosedCode", authenticate, remove);

export default router;
