// Waste Invoice (Waste Sales) — Customer Wise.
// Mirrors rptWasteInvoiceCustomerWise.rdlc — invoices grouped by Customer,
// each customer with a Total row, plus a Grand Total.
//
// SP: sp_WasteInvoiceDetails_GetAll (CompanyCode, FromDate, ToDate)

import { runReport } from '../cotton/_common.js';
import { buildInvoiceDoc, ddmmyyyy } from './_wasteInvoiceCommon.js';

const TITLE = 'WASTE SALES REPORT - CUSTOMER WISE';
const FILE_NAME = 'WasteInvoice_CustomerWise';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  return buildInvoiceDoc({
    rows, companyName, companyLogo, fromDate, toDate,
    title: TITLE,
    groupKey: (inv) => inv.CustomerCode || inv.CustomerName || '',
    groupTitle: (inv) => inv.CustomerName || '(No Customer)',
    sortKeys: (a, b) => String(a).localeCompare(String(b)),
    leadCol: { label: 'Date', value: (inv) => ddmmyyyy(inv.WasteInvoiceDate), align: 'center' }
  });
}

export const wasteInvoiceCustomerWiseReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_WasteInvoiceDetails_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
