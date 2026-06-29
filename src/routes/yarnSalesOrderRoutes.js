import express from "express";
import {
  getOptions,
  getTaxTypes,
  getNextNo,
  getCustomerCredit,
  getStock,
  getQualityStdDetails,
  getList,
  getOne,
  create,
  update,
  remove,
} from "../controllers/yarnSalesOrder.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Yarn Sales Order (frmSalesOrderAdd / frmSalesOrderDetails).
router.get("/options", authenticate, getOptions);                 // dropdowns + settings
router.get("/tax-types", authenticate, getTaxTypes);              // tax rows by sales type
router.get("/next-no", authenticate, getNextNo);                  // auto S.O. No
router.get("/customer-credit", authenticate, getCustomerCredit);  // credit limit / balance
router.get("/stock", authenticate, getStock);                     // count-wise bag stock
router.get("/quality-std", authenticate, getQualityStdDetails);   // STD parameter rows
router.get("/lists", authenticate, getList);                      // open sales orders
router.post("/create", authenticate, create);                     // header + 4 grids
router.put("/update/:soCode", authenticate, update);              // edit
router.delete("/:soCode", authenticate, remove);                  // delete
router.get("/:soCode", authenticate, getOne);                     // load one (edit) — keep last

export default router;
