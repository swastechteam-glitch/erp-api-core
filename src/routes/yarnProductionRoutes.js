import express from "express";
import {
  getOptions,
  getEmployeesByDate,
  getNextBagNo,
  getList,
  create,
  update,
} from "../controllers/yarnProduction.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Production Add (frmYarnProductionAdd / "Production Add" screen).
router.get("/options", authenticate, getOptions);          // all header dropdowns
router.get("/employees", authenticate, getEmployeesByDate); // supervisor/employee by date
router.get("/next-bag-no", authenticate, getNextBagNo);     // auto bag number
router.get("/lists", authenticate, getList);                // saved production rows (grid)
router.post("/create", authenticate, create);               // insert 1..N bags
router.put("/update/:productionNo", authenticate, update);  // edit one bag

export default router;
