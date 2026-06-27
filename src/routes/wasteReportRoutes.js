import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { wasteProductionDateWiseReport } from "../controllers/report/waste/wasteProductionDateWise.js";
import { wasteProductionItemWiseReport } from "../controllers/report/waste/wasteProductionItemWise.js";
import { wasteProductionBaleWiseReport } from "../controllers/report/waste/wasteProductionBaleWise.js";
import { wasteProductionBaleNoAbstractReport } from "../controllers/report/waste/wasteProductionBaleNoAbstract.js";
import { wasteProductionItemAbstractReport } from "../controllers/report/waste/wasteProductionItemAbstract.js";
import { wasteInvoiceDateWiseReport } from "../controllers/report/waste/wasteInvoiceDateWise.js";
import { wasteInvoiceCustomerWiseReport } from "../controllers/report/waste/wasteInvoiceCustomerWise.js";
import { wasteScrapInvoiceReport } from "../controllers/report/waste/wasteScrapInvoice.js";
import { wasteInvoiceReport } from "../controllers/report/waste/wasteInvoiceReport.js";
import { wasteInvoiceApprovalReport } from "../controllers/report/waste/wasteInvoiceApproval.js";
import { wasteStockStatusReport } from "../controllers/report/waste/wasteStockStatus.js";
import { wasteStockReport, wasteStockOptions } from "../controllers/report/waste/wasteStockReport.js";
import { wasteStockCurrentReport } from "../controllers/report/waste/wasteStockCurrentReport.js";
import { usableWasteProductionReport, usableWasteProductionOptions } from "../controllers/report/waste/usableWasteProductionReport.js";
import { usableWasteIssueReport } from "../controllers/report/waste/usableWasteIssueReport.js";

const router = express.Router();

// Waste -> Waste Production Report
router.get("/production/date-wise", authenticate, wasteProductionDateWiseReport);
router.get("/production/item-wise", authenticate, wasteProductionItemWiseReport);
router.get("/production/bale-wise", authenticate, wasteProductionBaleWiseReport);
router.get("/production/bale-no-abstract", authenticate, wasteProductionBaleNoAbstractReport);
router.get("/production/item-abstract", authenticate, wasteProductionItemAbstractReport);

// Waste -> Waste Invoice (Waste Sales) Report
router.get("/invoice/date-wise", authenticate, wasteInvoiceDateWiseReport);
router.get("/invoice/customer-wise", authenticate, wasteInvoiceCustomerWiseReport);
// Unified Waste Invoice report — layout chosen by ?groupBy= (agent/date/customer/
// item/item-rate, + "-detailed"); functional Customer/TaxType/WasteItem filters.
router.get("/invoice/report", authenticate, wasteInvoiceReport);
router.get("/invoice/approval", authenticate, wasteInvoiceApprovalReport);

// Waste -> Scrap Invoice (Scrap Sales) Report
router.get("/scrap-invoice/date-wise", authenticate, wasteScrapInvoiceReport);

// Waste -> Waste Stock Report
router.get("/stock/status", authenticate, wasteStockStatusReport);
// Stock Report leaf (rptWasteStockStatus) — Stock Status / With Weight / Rate Per
// KG chosen by ?variant=, with functional W.Item Group / Waste Item filters.
router.get("/stock/report", authenticate, wasteStockReport);
router.get("/stock/options", authenticate, wasteStockOptions);
// Stock Current Status leaf (rptWasteStock) — Group By Abstract / Abstract With
// Weight / Bale No / Item / Date Wise chosen by ?groupBy=, with functional
// Supervisor / Waste Item filters.
router.get("/stock/current", authenticate, wasteStockCurrentReport);

// Waste -> Usable Waste Production Report (rptUsablewasteProductionDateWise)
router.get("/usable-waste-production/date-wise", authenticate, usableWasteProductionReport);
router.get("/usable-waste-production/options", authenticate, usableWasteProductionOptions);

// Waste -> Usable Waste Issue Report (rptUsableWasteItemIssue) — shares the
// usable-waste-production options endpoint (Supervisor / Employee / Item Name).
router.get("/usable-waste-issue/details", authenticate, usableWasteIssueReport);

export default router;
