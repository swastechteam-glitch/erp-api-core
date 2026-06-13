import express from "express";
import { getSchedulePendApproval } from "../controllers/mechanical.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";
// import { getDepartmentAndShiftData, getEmployeeAllotmentDetails, getUniqueEmployeeAllotments } from "../controllers/employeeAllotment.controller.js";
import {
  handleReport,
  handleSupplierWiseReport,
  handleItemWiseReport,
  handleCategoryWiseReport,
  handleCostHeadWiseReport,
  handlePendingCategoryWiseReport,
  handlePendingItemWiseReport,
  handlePendingSupplierWiseReport,
  handleInwardDateWiseReport,
  handleInwardSupplierWiseReport,
  handleInwardItemWiseReport,
  handleInwardDepartmentWiseReport,
  handleInwardCategoryWiseReport,
  handleIssueDateWiseReport,
  handleIssueDepartmentWiseReport,
  handleIssueItemWiseReport,
  handleIssueCostHeadWiseReport,
  handleIssueMachineWiseReport,
  handleStockGroupWiseReport,
  handleStockDepartmentWiseValueReport,
  handleStockDepartmentWiseClosingReport,
  handleServiceOrderMaterialDateWiseReport,
  handleServiceOrderMaterialDepartmentWiseReport,
  handleServiceOrderVisitorsDateWiseReport,
  handleServiceOrderVisitorsDepartmentWiseReport,
  handleCostingCategoryWiseReport,
  handleCostingDepartmentWiseReport,
  handleCostingItemWiseReport,
  handleCostingMachineWiseReport,
  handleYarnSalesOrderDateWiseReport,
  handleYarnSalesOrderCustomerWiseReport,
  handleYarnSalesOrderAgentWiseReport,
  handleYarnSalesOrderCountWiseReport,
  handleYarnInvoiceDateWiseReport,
  handleYarnInvoiceCustomerWiseReport,
  handleYarnInvoiceAgentWiseReport,
  handleYarnInvoiceCountWiseReport,
  handleYarnInvoiceAvgRateCountWiseReport,
  handleYarnPurchaseOrderDateWiseReport,
  handleYarnPurchaseOrderSupplierWiseReport,
  handleYarnPurchaseOrderCountWiseReport,
  handleYarnGrnDateWiseReport,
  handleYarnStockDateWiseReport,
  handleYarnStockWithKgsReport,
  handleYarnStockCountGroupWiseReport,
  handleYarnSalesOrderPendingDetailedReport,
  handleYarnSalesOrderPendingSummaryReport,
  handleYarnSalesReturnDateWiseReport,
  handleYarnSalesReturnCustomerWiseReport,
  handleYarnAgentCommissionDateWiseReport,
  handleYarnAgentCommissionAgentWiseReport,
  handleYarnSalesDayBookDateWiseReport,
  handleYarnProductionDateWiseReport,
  handleYarnProductionLotNoWiseReport,
  handleYarnProductionCountWiseReport,
  handleGrnBillPassingDateWiseReport,
  handleGrnBillPassingSupplierWiseReport,
  handleGrnApprovalPendingReport,
  handleServiceBillPassingDateWiseReport,
  handleServiceBillPassingSupplierWiseReport,
  handlePurchaseReturnDateWiseReport,
  handlePurchaseReturnSupplierWiseReport,
} from "../controllers/pdfReport.controller.js";


const router = express.Router();

router.get('/purchaseorderdetails',authenticate, handleReport);
router.get('/purchaseorder/supplierwise',authenticate, handleSupplierWiseReport);
router.get('/purchaseorder/itemwise',authenticate, handleItemWiseReport);
router.get('/purchaseorder/categorywise',authenticate, handleCategoryWiseReport);
router.get('/purchaseorder/costheadwise',authenticate, handleCostHeadWiseReport);
router.get('/purchaseorder/pending/categorywise',authenticate, handlePendingCategoryWiseReport);
router.get('/purchaseorder/pending/itemwise',authenticate, handlePendingItemWiseReport);
router.get('/purchaseorder/pending/supplierwise',authenticate, handlePendingSupplierWiseReport);
router.get('/inward/datewise',authenticate, handleInwardDateWiseReport);
router.get('/inward/supplierwise',authenticate, handleInwardSupplierWiseReport);
router.get('/inward/itemwise',authenticate, handleInwardItemWiseReport);
router.get('/inward/departmentwise',authenticate, handleInwardDepartmentWiseReport);
router.get('/inward/categorywise',authenticate, handleInwardCategoryWiseReport);
router.get('/issue/datewise',authenticate, handleIssueDateWiseReport);
router.get('/issue/departmentwise',authenticate, handleIssueDepartmentWiseReport);
router.get('/issue/itemwise',authenticate, handleIssueItemWiseReport);
router.get('/issue/costheadwise',authenticate, handleIssueCostHeadWiseReport);
router.get('/issue/machinewise',authenticate, handleIssueMachineWiseReport);
router.get('/stock/groupwise',authenticate, handleStockGroupWiseReport);
router.get('/stock/departmentwise-value',authenticate, handleStockDepartmentWiseValueReport);
router.get('/stock/departmentwise-closing',authenticate, handleStockDepartmentWiseClosingReport);
router.get('/service-order/material/datewise',authenticate, handleServiceOrderMaterialDateWiseReport);
router.get('/service-order/material/departmentwise',authenticate, handleServiceOrderMaterialDepartmentWiseReport);
router.get('/service-order/visitors/datewise',authenticate, handleServiceOrderVisitorsDateWiseReport);
router.get('/service-order/visitors/departmentwise',authenticate, handleServiceOrderVisitorsDepartmentWiseReport);
router.get('/costing/categorywise',authenticate, handleCostingCategoryWiseReport);
router.get('/costing/departmentwise',authenticate, handleCostingDepartmentWiseReport);
router.get('/costing/itemwise',authenticate, handleCostingItemWiseReport);
router.get('/costing/machinewise',authenticate, handleCostingMachineWiseReport);
router.get('/yarn/sales-order/datewise',authenticate, handleYarnSalesOrderDateWiseReport);
router.get('/yarn/sales-order/customerwise',authenticate, handleYarnSalesOrderCustomerWiseReport);
router.get('/yarn/sales-order/agentwise',authenticate, handleYarnSalesOrderAgentWiseReport);
router.get('/yarn/sales-order/countwise',authenticate, handleYarnSalesOrderCountWiseReport);
router.get('/yarn/sales-invoice/datewise',authenticate, handleYarnInvoiceDateWiseReport);
router.get('/yarn/sales-invoice/customerwise',authenticate, handleYarnInvoiceCustomerWiseReport);
router.get('/yarn/sales-invoice/agentwise',authenticate, handleYarnInvoiceAgentWiseReport);
router.get('/yarn/sales-invoice/countwise',authenticate, handleYarnInvoiceCountWiseReport);
router.get('/yarn/sales-invoice/avgrate-countwise',authenticate, handleYarnInvoiceAvgRateCountWiseReport);
router.get('/yarn/purchase-order/datewise',authenticate, handleYarnPurchaseOrderDateWiseReport);
router.get('/yarn/purchase-order/supplierwise',authenticate, handleYarnPurchaseOrderSupplierWiseReport);
router.get('/yarn/purchase-order/countwise',authenticate, handleYarnPurchaseOrderCountWiseReport);
router.get('/yarn/grn/datewise',authenticate, handleYarnGrnDateWiseReport);
router.get('/yarn/stock/datewise',authenticate, handleYarnStockDateWiseReport);
router.get('/yarn/stock/datewise-with-kgs',authenticate, handleYarnStockWithKgsReport);
router.get('/yarn/stock/count-group-wise',authenticate, handleYarnStockCountGroupWiseReport);
router.get('/yarn/sales-order-pending/detailed',authenticate, handleYarnSalesOrderPendingDetailedReport);
router.get('/yarn/sales-order-pending/summary',authenticate, handleYarnSalesOrderPendingSummaryReport);
router.get('/yarn/sales-return/datewise',authenticate, handleYarnSalesReturnDateWiseReport);
router.get('/yarn/sales-return/customerwise',authenticate, handleYarnSalesReturnCustomerWiseReport);
router.get('/yarn/agent-commission/datewise',authenticate, handleYarnAgentCommissionDateWiseReport);
router.get('/yarn/agent-commission/agentwise',authenticate, handleYarnAgentCommissionAgentWiseReport);
router.get('/yarn/sales-day-book',authenticate, handleYarnSalesDayBookDateWiseReport);
router.get('/yarn/production/datewise',authenticate, handleYarnProductionDateWiseReport);
router.get('/yarn/production/lotnowise',authenticate, handleYarnProductionLotNoWiseReport);
router.get('/yarn/production/countwise',authenticate, handleYarnProductionCountWiseReport);
router.get('/grn-bill-passing/datewise',authenticate, handleGrnBillPassingDateWiseReport);
router.get('/grn-bill-passing/supplierwise',authenticate, handleGrnBillPassingSupplierWiseReport);
router.get('/grn-approval/pending',authenticate, handleGrnApprovalPendingReport);
router.get('/service-bill-passing/datewise',authenticate, handleServiceBillPassingDateWiseReport);
router.get('/service-bill-passing/supplierwise',authenticate, handleServiceBillPassingSupplierWiseReport);
router.get('/purchase-return/datewise',authenticate, handlePurchaseReturnDateWiseReport);
router.get('/purchase-return/supplierwise',authenticate, handlePurchaseReturnSupplierWiseReport);
// router.get('/employee-allotment-details/list',authenticate, getEmployeeAllotmentDetails);
// router.get('/unique-employee-allotments/list',authenticate, getUniqueEmployeeAllotments);


export default router;
