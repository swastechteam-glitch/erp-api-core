// Yarn — Sales Invoice list (Document report).
// Returns one JSON row per invoice for the Documents Hub data grid, sourced
// from web_sp_InvoiceDetails_GetAll. Each row carries InvoiceCode (the id used
// by the details/print endpoint).
//
//   EXEC web_sp_InvoiceDetails_GetAll @FromDate, @ToDate, @OrderBy='BillDate'
//   (+ BranchCode/CompanyCode applied from headers)

import sql from 'mssql';
import { getPool } from '../../config/dynamicDB.js';
import { applyBranchCode } from '../../utils/common.js';

export const yarnSalesInvoiceList = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).json({ success: false, message: 'Missing subDBName' });
    }

    // The list SP is date-ranged. Default to a wide range so the document
    // picker shows everything; callers may narrow it with FromDate/ToDate.
    const fromDate = req.query.FromDate || req.query.fromDate || '2000-01-01';
    const toDate = req.query.ToDate || req.query.toDate || new Date().toISOString().slice(0, 10);

    const pool = await getPool(subDbName);
    const request = pool.request();
    applyBranchCode(request, req.headers); // BranchCode / CompanyCode from headers
    request.input('FromDate', sql.DateTime, new Date(fromDate));
    request.input('ToDate', sql.DateTime, new Date(toDate));
    request.input('OrderBy', sql.NVarChar(8), 'BillDate');

    const result = await request.execute('web_sp_InvoiceDetails_GetAll');
    const rows = result.recordset || [];

    if (req.query.debug === '1') {
      return res.type('text/plain').send(
        `rows=${rows.length}\n` + JSON.stringify(rows.slice(0, 2), null, 2)
      );
    }

    // web_sp_InvoiceDetails_GetAll returns one row per line item; collapse to
    // one row per invoice (keep the first row's header fields) for the picker.
    const seen = new Map();
    for (const r of rows) {
      const code = r.InvoiceCode;
      if (code != null && !seen.has(code)) seen.set(code, r);
    }
    const data = [...seen.values()].map((r) => ({
      id: r.InvoiceCode,
      InvoiceCode: r.InvoiceCode,
      InvoiceNo: r.strBillNo ?? r.strInvoiceNo ?? r.BillNo ?? r.InvoiceNo ?? '',
      BillDate: r.BillDate ?? r.InvoiceDate ?? null,
      CustomerName: r.CustomerName ?? '',
      NetAmount: r.NetAmount ?? r.Amount ?? 0,
    }));

    res.status(200).json({ totalRecords: data.length, data });
  } catch (err) {
    console.error('yarnSalesInvoiceList:', err);
    res.status(500).json({ error: err.message });
  }
};
