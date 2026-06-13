// Store — Purchase Order list (Document report).
// Returns one JSON row per purchase order for the Documents Hub data grid,
// sourced from sp_PurchaseOrderDetails_GetAll. Each row carries
// PurchaseOrderCode (the id used by the details/print endpoint).
//
//   EXEC sp_PurchaseOrderDetails_GetAll @CompanyCode, @FromDate, @ToDate

import sql from 'mssql';
import { getPool } from '../../config/dynamicDB.js';

export const storePurchaseOrderList = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).json({ success: false, message: 'Missing subDBName' });
    }

    const CompanyCode = parseInt(req.query.CompanyCode) || 0;
    // Date-ranged SP — default to a wide range so the picker shows everything.
    const fromDate = req.query.FromDate || req.query.fromDate || '2000-01-01';
    const toDate = req.query.ToDate || req.query.toDate || new Date().toISOString().slice(0, 10);

    const pool = await getPool(subDbName);
    const request = pool.request();
    request.input('CompanyCode', sql.Int, CompanyCode);
    request.input('FromDate', sql.DateTime, new Date(fromDate));
    request.input('ToDate', sql.DateTime, new Date(toDate));

    const result = await request.execute('sp_PurchaseOrderDetails_GetAll');
    const rows = result.recordset || [];

    if (req.query.debug === '1') {
      return res.type('text/plain').send(
        `rows=${rows.length}\n` + JSON.stringify(rows.slice(0, 2), null, 2)
      );
    }

    // One row per line item -> collapse to one row per purchase order.
    const seen = new Map();
    for (const r of rows) {
      const code = r.PurchaseOrderCode;
      if (code != null && !seen.has(code)) seen.set(code, r);
    }
    const data = [...seen.values()].map((r) => ({
      id: r.PurchaseOrderCode,
      PurchaseOrderCode: r.PurchaseOrderCode,
      PurchaseOrderNo: r.PurchaseOrderNo ?? '',
      PurchaseOrderDate: r.PurchaseOrderDate ?? null,
      SupplierName: r.SupplierName ?? '',
      NetAmount: r.TotalNetAmount ?? r.NetAmount ?? 0,
    }));

    res.status(200).json({ totalRecords: data.length, data });
  } catch (err) {
    console.error('storePurchaseOrderList:', err);
    res.status(500).json({ error: err.message });
  }
};
