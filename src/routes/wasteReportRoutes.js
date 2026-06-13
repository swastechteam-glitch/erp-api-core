import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { wasteProductionDateWiseReport } from "../controllers/report/waste/wasteProductionDateWise.js";
import { wasteProductionItemWiseReport } from "../controllers/report/waste/wasteProductionItemWise.js";
import { wasteInvoiceDateWiseReport } from "../controllers/report/waste/wasteInvoiceDateWise.js";
import { wasteInvoiceCustomerWiseReport } from "../controllers/report/waste/wasteInvoiceCustomerWise.js";
import { wasteStockStatusReport } from "../controllers/report/waste/wasteStockStatus.js";

const router = express.Router();

// Waste -> Waste Production Report
router.get("/production/date-wise", authenticate, wasteProductionDateWiseReport);
router.get("/production/item-wise", authenticate, wasteProductionItemWiseReport);

// Waste -> Waste Invoice (Waste Sales) Report
router.get("/invoice/date-wise", authenticate, wasteInvoiceDateWiseReport);
router.get("/invoice/customer-wise", authenticate, wasteInvoiceCustomerWiseReport);

// Waste -> Waste Stock Report
router.get("/stock/status", authenticate, wasteStockStatusReport);

export default router;
