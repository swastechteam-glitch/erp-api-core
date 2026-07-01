import express from "express";
import { getOptions, employeeDetail, employeeLookup, list, loanDetails, save, remove } from "../controllers/loanEntry.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Loan Advance Entry (frmLoan / frmLoanDetails)
router.get("/options", authenticate, getOptions);
router.get("/employee-lookup", authenticate, employeeLookup);
router.get("/employee-detail/:employeeCode", authenticate, employeeDetail);
router.get("/list", authenticate, list);
router.get("/details/:loanCode", authenticate, loanDetails);
router.post("/save", authenticate, save);
router.delete("/:loanCode", authenticate, remove);

export default router;
