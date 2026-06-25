import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { cottonDocumentReport } from "../controllers/documentReport/cotton.js";
import { cottonPoPrintDetails } from "../controllers/documentReport/cottonPoPrintDetails.js";
import { cottonGrnDocumentReport } from "../controllers/documentReport/cottonGrnPrint.js";
import { cottonGrnPrintDetails } from "../controllers/documentReport/cottonGrnPrintDetails.js";
import { cottonMoistureTestDocumentReport } from "../controllers/documentReport/cottonMoistureTestPrint.js";
import { cottonMoistureTestPrintDetails } from "../controllers/documentReport/cottonMoistureTestPrintDetails.js";
import { cottonWeighmentDocumentReport } from "../controllers/documentReport/cottonWeighmentPrint.js";
import { cottonWeighmentPrintDetails } from "../controllers/documentReport/cottonWeighmentPrintDetails.js";
import { cottonMixingRequisitionDocumentReport } from "../controllers/documentReport/cottonMixingRequisitionPrint.js";
import { cottonMixingRequisitionPrintDetails } from "../controllers/documentReport/cottonMixingRequisitionPrintDetails.js";
import { cottonBillPassingDocumentReport } from "../controllers/documentReport/cottonBillPassingPrint.js";
import { cottonBillPassingPrintDetails } from "../controllers/documentReport/cottonBillPassingPrintDetails.js";
import { cottonQualitySlipDocumentReport } from "../controllers/documentReport/cottonQualitySlipPrint.js";
import { cottonQualitySlipPrintDetails } from "../controllers/documentReport/cottonQualitySlipPrintDetails.js";
import { cottonSalesDocumentReport } from "../controllers/documentReport/cottonSalesPrint.js";
import { cottonSalesPrintDetails } from "../controllers/documentReport/cottonSalesPrintDetails.js";
import { yarnSalesInvoiceList } from "../controllers/documentReport/yarnSalesInvoice.js";
import { yarnSalesInvoiceDetails } from "../controllers/documentReport/yarnSalesInvoiceDetails.js";
import { storePurchaseOrderList } from "../controllers/documentReport/storePurchaseOrder.js";
import { storePurchaseOrderDetails } from "../controllers/documentReport/storePurchaseOrderDetails.js";

const router = express.Router();

// Document report endpoints (scoped by CompanyCode + FYCode query params).
// Cotton purchase order print list (JSON) from vw_CottonPurchaseOrder.
router.get('/cotton/po-print', authenticate, cottonDocumentReport);
// Single cotton purchase order print (PDF) — sp_CottonPurchaseOrderDetails_GetAll @CPOCode.
router.get('/cotton/po-print/details', authenticate, cottonPoPrintDetails);
// Cotton GRN print list (JSON) from vw_CottonArrival.
router.get('/cotton/grn-print', authenticate, cottonGrnDocumentReport);
// Single cotton GRN print (PDF) — sp_CottonArrival_GetAll @CompanyCode, @ArrivalCode.
router.get('/cotton/grn-print/details', authenticate, cottonGrnPrintDetails);
// Cotton moisture test print list (JSON) from vw_CottonMoistureTest (FYCode-scoped).
router.get('/cotton/moisture-test-print', authenticate, cottonMoistureTestDocumentReport);
// Single cotton moisture test print (PDF) — sp_CottonMoistureTestDetails_GetAll @ArrivalCode.
router.get('/cotton/moisture-test-print/details', authenticate, cottonMoistureTestPrintDetails);
// Cotton weighment slip list (JSON) — sp_CottonWeighment_GetAll @CompanyCode, @FYCode.
router.get('/cotton/weighment-slip-print', authenticate, cottonWeighmentDocumentReport);
// Single cotton weighment slip (PDF) — sp_CottonWeighment_GetAll + sp_CottonWeighment_Abstract @CompanyCode, @WeighmentCode.
router.get('/cotton/weighment-slip-print/details', authenticate, cottonWeighmentPrintDetails);
// Cotton mixing issue requisition list (JSON) from tbl_CMIRequisition (Company + FYCode).
router.get('/cotton/mixing-requisition-print', authenticate, cottonMixingRequisitionDocumentReport);
// Single cotton mixing issue requisition (PDF) — sp_CMIRequisitionDetails_GetAll @CompanyCode, @CMIRequisitionCode.
router.get('/cotton/mixing-requisition-print/details', authenticate, cottonMixingRequisitionPrintDetails);
// Cotton bill passing pending list (JSON) — sp_CottonBillPassing_Pendings @CompanyCode, @FyCode.
router.get('/cotton/bill-passing-print', authenticate, cottonBillPassingDocumentReport);
// Single cotton bill passing (PDF) — sp_CottonPayment_BillPassing_Load + sp_CottonQualityTestDetails_GetAll @ArrivalCode.
router.get('/cotton/bill-passing-print/details', authenticate, cottonBillPassingPrintDetails);
// Cotton quality test slip list (JSON) — sp_CottonQualityTest_GetAll @CompanyCode, @FYCode.
router.get('/cotton/quality-slip-print', authenticate, cottonQualitySlipDocumentReport);
// Single cotton quality test slip (PDF) — sp_CottonQualityTestDetails_GetAll @ArrivalCode.
router.get('/cotton/quality-slip-print/details', authenticate, cottonQualitySlipPrintDetails);
// Cotton (RawMaterial) sales print list (JSON) — sp_CottonSales_GetAll @CompanyCode.
router.get('/cotton/sales-print', authenticate, cottonSalesDocumentReport);
// Single cotton sales invoice (PDF) — sp_CottonSalesDetails_GetAll @CompanyCode, @CottonSalesCode.
router.get('/cotton/sales-print/details', authenticate, cottonSalesPrintDetails);

// Yarn sales invoice list (JSON) — web_sp_InvoiceDetails_GetAll.
router.get('/yarn/sales-invoice', authenticate, yarnSalesInvoiceList);
// Single yarn sales invoice (GST PDF) — web_sp_Invoice_GetByInvoiceCode(+_Multi) @InvoiceCode.
router.get('/yarn/sales-invoice/details', authenticate, yarnSalesInvoiceDetails);

// Store purchase order list (JSON) — sp_PurchaseOrderDetails_GetAll.
router.get('/store/purchase-order', authenticate, storePurchaseOrderList);
// Single store purchase order (PDF) — web_sp_PurchaseOrder_GetAll(+Details) @PurchaseOrderCode.
router.get('/store/purchase-order/details', authenticate, storePurchaseOrderDetails);

export default router;
