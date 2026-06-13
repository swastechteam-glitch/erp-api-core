// Waste Invoice (Waste Sales) — Date Wise.
// Mirrors rptWasteInvoiceDateWise.rdlc — invoices grouped by WasteInvoiceDate,
// each date with a Total row, plus a Grand Total.
//
// SP: sp_WasteInvoiceDetails_GetAll (CompanyCode, FromDate, ToDate)

import { runReport } from '../cotton/_common.js';
import { buildInvoiceDoc, ddmmyyyy } from './_wasteInvoiceCommon.js';

const TITLE = 'WASTE SALES REPORT - DATE WISE';
const FILE_NAME = 'WasteInvoice_DateWise';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  return buildInvoiceDoc({
    rows, companyName, companyLogo, fromDate, toDate,
    title: TITLE,
    groupKey: (inv) => (inv.WasteInvoiceDate ? new Date(inv.WasteInvoiceDate).toISOString().slice(0, 10) : ''),
    groupTitle: (inv) => `Date : ${ddmmyyyy(inv.WasteInvoiceDate)}`,
    sortKeys: (a, b) => new Date(a) - new Date(b),
    leadCol: { label: 'Customer Name', value: (inv) => inv.CustomerName, align: 'left' }
  });
}

export const wasteInvoiceDateWiseReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_WasteInvoiceDetails_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
