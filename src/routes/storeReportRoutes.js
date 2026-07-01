import express from "express";
import { getStoreReports } from "../controllers/store.reports.js";
import { authenticate } from "../middleware/authMiddleware.js";
import {
  purchaseRequisitionReport,
  purchaseRequisitionPendingReport,
  purchaseRequisitionPendingReqReport,
  purchaseRequisitionReportOptions,
} from "../controllers/report/store/purchaseRequisition.js";
import {
  purchaseOrderReport,
  purchaseOrderPendingReport,
  purchaseOrderReportOptions,
} from "../controllers/report/store/purchaseOrder.js";
import {
  inwardReport,
  inwardAbstractReport,
  inwardReportOptions,
} from "../controllers/report/store/inward.js";
import {
  grnWithoutIssueReport,
  grnWithoutIssueOptions,
} from "../controllers/report/store/grnWithoutIssue.js";
import {
  purchaseReturnReport,
  purchaseReturnReportOptions,
} from "../controllers/report/store/purchaseReturn.js";
import {
  issueReport,
  issueStockInwardReport,
  issueStockConsumptionReport,
  issueYearWiseReport,
  issueMonthWiseReport,
  issueSummaryReport,
  issueReportOptions,
} from "../controllers/report/store/issue.js";
import {
  stockLedgerReport,
  stockLedgerNonMovingReport,
  stockLedgerYearlyReport,
  stockLedgerOptions,
} from "../controllers/report/store/stockLedger.js";


const router = express.Router();

router.get('/export', authenticate, getStoreReports);

// Purchase Requisition Report (port of WinForms rptItemRequisitionDetails).
// Details (?groupBy=document|item|department|category|costhead) + 2 Pending variants.
router.get('/purchase-requisition/options', authenticate, purchaseRequisitionReportOptions);
router.get('/purchase-requisition', authenticate, purchaseRequisitionReport);
router.get('/purchase-requisition-pending', authenticate, purchaseRequisitionPendingReport);
router.get('/purchase-requisition-pending-req', authenticate, purchaseRequisitionPendingReqReport);

// Purchase Order Report (port of WinForms rptPurchaseOrderDetails).
// Details (?groupBy=date|supplier|item|category|costhead|closure) +
// Pending (?groupBy=date|supplier|item|category).
router.get('/purchase-order/options', authenticate, purchaseOrderReportOptions);
router.get('/purchase-order', authenticate, purchaseOrderReport);
router.get('/purchase-order-pending', authenticate, purchaseOrderPendingReport);

// Inward Report (port of WinForms rptPurchaseOrderReceivedDetails).
// Details  (sp_RptPurchaseOrderReceivedDetails) ?groupBy=inward|supplier|item|
//   category|costhead|department|po|rateanalysis|grn|groupabstract|
//   groupitemabstract|monthitem
// Abstract (sp_RptPurchaseOrderReceived)        ?groupBy=inwardwise|invoicewise|supplierabstract
router.get('/inward/options', authenticate, inwardReportOptions);
router.get('/inward', authenticate, inwardReport);
router.get('/inward-abstract', authenticate, inwardAbstractReport);

// GRN Item Without Issue Report (port of WinForms rptGRNWithoutIssue).
// Single SP (sp_GRN_WithoutIssue_Item), flat table, one report type.
router.get('/grn-without-issue/options', authenticate, grnWithoutIssueOptions);
router.get('/grn-without-issue', authenticate, grnWithoutIssueReport);

// Purchase Return Report (port of WinForms rptPurchaseReturnDetails).
// One SP (sp_PurchaseReturnDetails_GetAll), ?groupBy=supplier|returndate|returnno.
router.get('/purchase-return/options', authenticate, purchaseReturnReportOptions);
router.get('/purchase-return', authenticate, purchaseReturnReport);

// Issue / Store Issue Report (port of WinForms rptIssueDetails). Six SP families,
// one screen. Branch is sent to the SP as @BranchCode; the rest filter in-memory.
//   /issue                  sp_IssueDetails_GetAll ?groupBy=issueno|item|date|
//                           machine|costhead|department|deptcost|category
//   /issue-stock-inward     sp_Stock_Statement
//   /issue-stock-consumption sp_StockUnitWiseConsumption
//   /issue-year-wise        sp_Issue_YearWise
//   /issue-month-wise       sp_Issue_MonthWise_Report
//   /issue-summary          sp_Issue_GetAll
router.get('/issue/options', authenticate, issueReportOptions);
router.get('/issue', authenticate, issueReport);
router.get('/issue-stock-inward', authenticate, issueStockInwardReport);
router.get('/issue-stock-consumption', authenticate, issueStockConsumptionReport);
router.get('/issue-year-wise', authenticate, issueYearWiseReport);
router.get('/issue-month-wise', authenticate, issueMonthWiseReport);
router.get('/issue-summary', authenticate, issueSummaryReport);

// Stock Ledger Report (port of WinForms rptStockLedger). Three SP families.
//   /stock-ledger            sp_Stock_Statement ?groupBy=individual|summary|
//        deptledger|deptqtyvalue|categoryqtyvalue|rack|history|aging
//   /stock-ledger-nonmoving  sp_Store_NonMoving_Stock (Days required)
//   /stock-ledger-yearly     sp_Store_YearWise_Report
router.get('/stock-ledger/options', authenticate, stockLedgerOptions);
router.get('/stock-ledger', authenticate, stockLedgerReport);
router.get('/stock-ledger-nonmoving', authenticate, stockLedgerNonMovingReport);
router.get('/stock-ledger-yearly', authenticate, stockLedgerYearlyReport);



export default router;
