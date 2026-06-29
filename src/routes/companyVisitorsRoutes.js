import express from "express";
import {
  getOptions,
  getNextNo,
  getPending,
  getList,
  getEmployees,
  getEmployeeById,
  getEmployeePhoto,
  getRecord,
  save,
} from "../controllers/companyVisitors.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Company Visitors — Pass Entry (frmCompanyVisitorsIn)
router.get("/options", authenticate, getOptions);
router.get("/next-no", authenticate, getNextNo);
router.get("/pending", authenticate, getPending);
router.get("/lists", authenticate, getList);
router.get("/employees", authenticate, getEmployees);
router.get("/employee-by-id/:empId", authenticate, getEmployeeById);
router.get("/employee-photo/:employeeCode", authenticate, getEmployeePhoto);
router.get("/record/:code", authenticate, getRecord);
router.post("/save", authenticate, save);

export default router;
