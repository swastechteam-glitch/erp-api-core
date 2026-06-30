import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { applyBranchCode, showBranchDropDown } from "../utils/common.js";
import PdfPrinter from 'pdfmake'
import inwardReport from './report/store/inwardReport.js'
import issueReport from './report/store/issueReport.js'
import stockReport from './report/store/stockReport.js'
import serviceOrderCompleteReport from './report/store/serviceOrderCompleteReport.js'
import costingReport from './report/store/costingReport.js'
import grnBillPassing from './report/store/grnBillPassing.js'
import serviceBillPassing from './report/store/serviceBillPassing.js'
import yarnSalesOrderReport from './report/yarn/salesOrderReport.js'
import yarnInvoiceReport from './report/yarn/invoiceReport.js'
import yarnPurchaseOrderReport from './report/yarn/purchaseOrderReport.js'
import yarnGrnReport from './report/yarn/grnReport.js'
import yarnStockReport from './report/yarn/stockReport.js'
import yarnSalesOrderPendingReport from './report/yarn/salesOrderPendingReport.js'
import yarnSalesReturnReport from './report/yarn/salesReturnReport.js'
import yarnAgentCommissionReport from './report/yarn/agentCommissionReport.js'
import yarnSalesDayBookReport from './report/yarn/salesDayBookReport.js'
import yarnProductionReport from './report/yarn/productionReport.js'

const fontDescriptors = {
  Roboto: {
    normal: 'Times-Roman',
    bold: 'Times-Bold',
    italics: 'Times-Italic',
    bolditalics: 'Times-BoldItalic'
  }
};
const printer = new PdfPrinter(fontDescriptors);
 
function renderPdf(docDefinition) {
  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on('data', (c) => chunks.push(c));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    } catch (err) {
      reject(err);
    }
  });
}
 
function readParams(req) {
  return {
    CompanyCode: req.query.CompanyCode || '0',
    FromDate: req.query.FromDate || new Date().toISOString().slice(0, 10),
    ToDate: req.query.ToDate || new Date().toISOString().slice(0, 10),
    // debug: req.query.debug === '1'
  };
}
 
// Detect image magic bytes and emit a data URI pdfmake can render.
function bufferToDataUri(buf) {
  if (!buf) return null;
  const b = Buffer.isBuffer(buf) ? buf : (buf?.data ? Buffer.from(buf.data) : null);
  if (!b || b.length < 4) return null;
  let mime = 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) mime = 'image/png';
  else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) mime = 'image/gif';
  else if (b[0] === 0x42 && b[1] === 0x4D) mime = 'image/bmp';
  return `data:${mime};base64,${b.toString('base64')}`;
}

async function getCompanyInfo(pool, companyCode) {
  const req = pool.request();
  req.input('CompanyCode', sql.Int, parseInt(companyCode) || 0);
  const result = await req.execute('sp_Company_GetAll');
  const rows = result.recordset || [];
  if (rows.length === 0) return { name: '', logo: null };
  return {
    name: rows[0].CompanyName || '',
    logo: bufferToDataUri(rows[0].Logo)
  };
}

// Back-compat — kept so any caller still expecting just the name string works.
async function getCompanyName(pool, companyCode) {
  return (await getCompanyInfo(pool, companyCode)).name;
}

// Some self-contained report builders render their title as a plain centred
// { stack: [companyName, title, dateRange] } with no logo. This walks the doc
// content and wraps any such title block in a 3-column layout with the company
// logo on the left, so every report shows the logo. Title blocks that already
// include a logo use `columns` (not a bare `stack`) and are left untouched.
function addLogoToTitles(docDef, companyName, logo) {
  if (!logo || !docDef || !Array.isArray(docDef.content)) return;
  const LOGO_W = 80;
  for (let i = 0; i < docDef.content.length; i++) {
    const el = docDef.content[i];
    if (el && Array.isArray(el.stack) && el.stack[0] && el.stack[0].text === companyName) {
      const wrapped = {
        columns: [
          { image: logo, fit: [70, 70], width: LOGO_W, alignment: 'left', margin: [4, 0, 0, 0] },
          { width: '*', stack: el.stack },
          { text: '', width: LOGO_W }
        ]
      };
      if (el.pageBreak) wrapped.pageBreak = el.pageBreak;
      if (el.margin) wrapped.margin = el.margin;
      docDef.content[i] = wrapped;
    }
  }
}

async function runReport(req, res, { spName, reportModule, fileName, extraInputs, noDateParams }) {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const p = readParams(req);
    const pool = await getPool(subDbName);

    const tSp = Date.now();
    const spReq = pool.request();
    spReq.input('CompanyCode', sql.Int, parseInt(p.CompanyCode) || 0);
    // Some SPs (e.g. pending lists) only take CompanyCode — skip the date params.
    if (!noDateParams) {
      spReq.input('FromDate', sql.DateTime, p.FromDate ? new Date(p.FromDate) : null);
      spReq.input('ToDate', sql.DateTime, p.ToDate ? new Date(p.ToDate) : null);
    }
    if (typeof extraInputs === 'function') {
      extraInputs(spReq, sql, p);
    }
    const spResult = await spReq.execute(spName);
    const detail = spResult.recordset || [];
    const company = await getCompanyInfo(pool, p.CompanyCode);
    const spMs = Date.now() - tSp;

    const tRender = Date.now();
    const docDef = reportModule.buildDocDefinition(detail, company.name, p.FromDate, p.ToDate, company.logo);
    addLogoToTitles(docDef, company.name, company.logo);
    const pdfBuffer = await renderPdf(docDef);
    const renderMs = Date.now() - tRender;

    if (p.debug) {
      return res.type('text/plain').send(
        `rows=${detail.length}\n` +
        `SP fetch: ${spMs} ms\n` +
        `PDF render: ${renderMs} ms, size=${pdfBuffer.length} bytes\n` +
        `Total: ${Date.now() - t0} ms`
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);

  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

// NOTE: The Store Purchase Order report (Details + Pending) was moved to the new
// shared-_common.js convention in controllers/report/store/purchaseOrder.js
// (endpoints /store/reports/purchase-order*). Its old handlers were removed here.

// sp_RptPurchaseOrderReceivedDetails also takes a static @WithImage flag (0 = no
// item images in the result set). Applied to every inward variant.
const inwardExtraInputs = (spReq, sqlMod) => { spReq.input('WithImage', sqlMod.Int, 0); };

export const handleInwardDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_RptPurchaseOrderReceivedDetails',
  reportModule: inwardReport.dateWise,
  fileName: 'Inward_DateWise',
  extraInputs: inwardExtraInputs
});

export const handleInwardSupplierWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_RptPurchaseOrderReceivedDetails',
  reportModule: inwardReport.supplierWise,
  fileName: 'Inward_SupplierWise',
  extraInputs: inwardExtraInputs
});

export const handleInwardItemWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_RptPurchaseOrderReceivedDetails',
  reportModule: inwardReport.itemWise,
  fileName: 'Inward_ItemWise',
  extraInputs: inwardExtraInputs
});

export const handleInwardDepartmentWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_RptPurchaseOrderReceivedDetails',
  reportModule: inwardReport.departmentWise,
  fileName: 'Inward_DepartmentWise',
  extraInputs: inwardExtraInputs
});

export const handleInwardCategoryWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_RptPurchaseOrderReceivedDetails',
  reportModule: inwardReport.categoryWise,
  fileName: 'Inward_CategoryWise',
  extraInputs: inwardExtraInputs
});

export const handleIssueDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_IssueDetails_GetAll',
  reportModule: issueReport.dateWise,
  fileName: 'Issue_DateWise'
});

export const handleIssueDepartmentWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_IssueDetails_GetAll',
  reportModule: issueReport.departmentWise,
  fileName: 'Issue_DepartmentWise'
});

export const handleIssueItemWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_IssueDetails_GetAll',
  reportModule: issueReport.itemWise,
  fileName: 'Issue_ItemWise'
});

export const handleIssueCostHeadWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_IssueDetails_GetAll',
  reportModule: issueReport.costHeadWise,
  fileName: 'Issue_CostHeadWise'
});

export const handleIssueMachineWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_IssueDetails_GetAll',
  reportModule: issueReport.machineWise,
  fileName: 'Issue_MachineWise'
});

export const handleStockGroupWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_Stock_Statement',
  reportModule: stockReport.groupWise,
  fileName: 'Stock_LedgerAbstract',
  extraInputs: (spReq, sqlMod) => { spReq.input('ReceiptIssueBased', sqlMod.Int, 0); }
});

export const handleStockDepartmentWiseValueReport = (req, res) => runReport(req, res, {
  spName: 'sp_Stock_Statement',
  reportModule: stockReport.departmentWiseValue,
  fileName: 'Stock_DepartmentWiseValue',
  extraInputs: (spReq, sqlMod) => { spReq.input('ReceiptIssueBased', sqlMod.Int, 0); }
});

export const handleStockDepartmentWiseClosingReport = (req, res) => runReport(req, res, {
  spName: 'sp_Stock_Statement',
  reportModule: stockReport.departmentWiseClosing,
  fileName: 'Stock_DepartmentWiseClosing',
  extraInputs: (spReq, sqlMod) => { spReq.input('ReceiptIssueBased', sqlMod.Int, 0); }
});

export const handleServiceOrderMaterialDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_ServiceOrderCompleteDetails_GetAll',
  reportModule: serviceOrderCompleteReport.materialDateWise,
  fileName: 'ServiceOrderComplete_Material_DateWise'
});

export const handleServiceOrderMaterialDepartmentWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_ServiceOrderCompleteDetails_GetAll',
  reportModule: serviceOrderCompleteReport.materialDepartmentWise,
  fileName: 'ServiceOrderComplete_Material_DepartmentWise'
});

export const handleServiceOrderVisitorsDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_ServiceOrderCompleteDetails_GetAll',
  reportModule: serviceOrderCompleteReport.visitorsDateWise,
  fileName: 'ServiceOrderComplete_Visitors_DateWise'
});

export const handleServiceOrderVisitorsDepartmentWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_ServiceOrderCompleteDetails_GetAll',
  reportModule: serviceOrderCompleteReport.visitorsDepartmentWise,
  fileName: 'ServiceOrderComplete_Visitors_DepartmentWise'
});

export const handleCostingCategoryWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_Store_Costing',
  reportModule: costingReport.categoryWise,
  fileName: 'Costing_CategoryWise'
});

export const handleCostingDepartmentWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_Store_Costing',
  reportModule: costingReport.departmentWise,
  fileName: 'Costing_DepartmentWise'
});

export const handleCostingItemWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_Store_Costing',
  reportModule: costingReport.itemWise,
  fileName: 'Costing_ItemWise'
});

export const handleCostingMachineWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_Store_Costing',
  reportModule: costingReport.machineWise,
  fileName: 'Costing_MachineWise'
});

export const handleYarnSalesOrderDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_SalesOrderDetails_GetAll',
  reportModule: yarnSalesOrderReport.dateWise,
  fileName: 'YarnSalesOrder_DateWise'
});

export const handleYarnSalesOrderCustomerWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_SalesOrderDetails_GetAll',
  reportModule: yarnSalesOrderReport.customerWise,
  fileName: 'YarnSalesOrder_CustomerWise'
});

export const handleYarnSalesOrderAgentWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_SalesOrderDetails_GetAll',
  reportModule: yarnSalesOrderReport.agentWise,
  fileName: 'YarnSalesOrder_AgentWise'
});

export const handleYarnSalesOrderCountWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_SalesOrderDetails_GetAll',
  reportModule: yarnSalesOrderReport.countWise,
  fileName: 'YarnSalesOrder_CountWise'
});

export const handleYarnInvoiceDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_InvoiceDetails_GetAll',
  reportModule: yarnInvoiceReport.dateWise,
  fileName: 'YarnInvoice_DateWise'
});

export const handleYarnInvoiceCustomerWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_InvoiceDetails_GetAll',
  reportModule: yarnInvoiceReport.customerWise,
  fileName: 'YarnInvoice_CustomerWise'
});

export const handleYarnInvoiceAgentWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_InvoiceDetails_GetAll',
  reportModule: yarnInvoiceReport.agentWise,
  fileName: 'YarnInvoice_AgentWise'
});

export const handleYarnInvoiceCountWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_InvoiceDetails_GetAll',
  reportModule: yarnInvoiceReport.countWise,
  fileName: 'YarnInvoice_CountWise'
});

export const handleYarnInvoiceAvgRateCountWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_InvoiceDetails_GetAll',
  reportModule: yarnInvoiceReport.avgRateCountWise,
  fileName: 'YarnInvoice_AvgRateCountWise'
});

export const handleYarnPurchaseOrderDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_YarnPurchaseOrderDetails_GetAll',
  reportModule: yarnPurchaseOrderReport.dateWise,
  fileName: 'YarnPurchaseOrder_DateWise'
});

export const handleYarnPurchaseOrderSupplierWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_YarnPurchaseOrderDetails_GetAll',
  reportModule: yarnPurchaseOrderReport.supplierWise,
  fileName: 'YarnPurchaseOrder_SupplierWise'
});

export const handleYarnPurchaseOrderCountWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_YarnPurchaseOrderDetails_GetAll',
  reportModule: yarnPurchaseOrderReport.countWise,
  fileName: 'YarnPurchaseOrder_CountWise'
});

export const handleYarnGrnDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_YarnGRN_GetAll',
  reportModule: yarnGrnReport.dateWise,
  fileName: 'YarnGRN_DateWise'
});

export const handleYarnStockDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_StockStatement_Yarn',
  reportModule: yarnStockReport.dateWise,
  fileName: 'YarnStock_DateWise'
});

export const handleYarnStockWithKgsReport = (req, res) => runReport(req, res, {
  spName: 'sp_StockStatement_Yarn',
  reportModule: yarnStockReport.withKgs,
  fileName: 'YarnStock_WithWeight'
});

export const handleYarnStockCountGroupWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_StockStatement_Yarn',
  reportModule: yarnStockReport.countGroupWise,
  fileName: 'YarnStock_CountGroupWise'
});

export const handleYarnSalesOrderPendingDetailedReport = (req, res) => runReport(req, res, {
  spName: 'sp_Pending_InvoiceList_GetAll',
  reportModule: yarnSalesOrderPendingReport.detailed,
  fileName: 'YarnSalesOrderPending_Detailed'
});

export const handleYarnSalesOrderPendingSummaryReport = (req, res) => runReport(req, res, {
  spName: 'sp_Pending_InvoiceList_GetAll',
  reportModule: yarnSalesOrderPendingReport.summary,
  fileName: 'YarnSalesOrderPending_Summary'
});

export const handleYarnSalesReturnDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_SalesReturn_GetAll',
  reportModule: yarnSalesReturnReport.dateWise,
  fileName: 'YarnSalesReturn_DateWise'
});

export const handleYarnSalesReturnCustomerWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_SalesReturn_GetAll',
  reportModule: yarnSalesReturnReport.customerWise,
  fileName: 'YarnSalesReturn_CustomerWise'
});

export const handleYarnAgentCommissionDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_YarnAgentCommission_GetAll',
  reportModule: yarnAgentCommissionReport.dateWise,
  fileName: 'YarnAgentCommission_DateWise'
});

export const handleYarnAgentCommissionAgentWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_YarnAgentCommission_GetAll',
  reportModule: yarnAgentCommissionReport.agentWise,
  fileName: 'YarnAgentCommission_AgentWise'
});

export const handleYarnSalesDayBookDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_SalesDayBook',
  reportModule: yarnSalesDayBookReport.dateWise,
  fileName: 'YarnSalesDayBook_DateWise'
});

export const handleYarnProductionDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_BagProductionDetails_GetByRefDate',
  reportModule: yarnProductionReport.dateWise,
  fileName: 'YarnProduction_DateWise'
});

export const handleYarnProductionLotNoWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_YarnProduction_GetAll',
  reportModule: yarnProductionReport.lotNoWise,
  fileName: 'YarnProduction_LotNoWise'
});

export const handleYarnProductionCountWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_YarnProduction_GetAll',
  reportModule: yarnProductionReport.countWise,
  fileName: 'YarnProduction_CountWise'
});

export const handleGrnBillPassingDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_StoreGRNApproval_GetAll',
  reportModule: grnBillPassing.dateWise,
  fileName: 'GrnBillPassing_DateWise'
});

export const handleGrnBillPassingSupplierWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_StoreGRNApproval_GetAll',
  reportModule: grnBillPassing.supplierWise,
  fileName: 'GrnBillPassing_SupplierWise'
});

export const handleGrnApprovalPendingReport = (req, res) => runReport(req, res, {
  spName: 'sp_StoreGRNApproval_Pending',
  reportModule: grnBillPassing.pending,
  fileName: 'GrnApproval_Pending',
  noDateParams: true
});

export const handleServiceBillPassingDateWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_ServiceOrderComplete_Approval_GetAll',
  reportModule: serviceBillPassing.dateWise,
  fileName: 'ServiceBillPassing_DateWise'
});

export const handleServiceBillPassingSupplierWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_ServiceOrderComplete_Approval_GetAll',
  reportModule: serviceBillPassing.supplierWise,
  fileName: 'ServiceBillPassing_SupplierWise'
});

