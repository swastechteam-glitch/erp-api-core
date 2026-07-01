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
import yarnTransportInvoiceReport from './report/yarn/transportInvoiceReport.js'
import yarnSalesDayBookReport from './report/yarn/salesDayBookReport.js'
import yarnProductionReport from './report/yarn/productionReport.js'
import yarnProductionBagReports from './report/yarn/productionBagReports.js'
import yarnMasterReports from './report/yarn/masterReports.js'

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
// ---------------------------------------------------------------------------
// Yarn MASTER reports (rptCountName family). Unlike runReport, the master
// sp_*_GetAll procs take NO @CompanyCode / date params — only an OPTIONAL
// @Status (1=ACTIVE, 0=INACTIVE; omitted = ALL). So this runs the proc with at
// most @Status, then renders via the same pdfmake pipeline (the company
// header/logo still come from sp_Company_GetAll using the JWT company).
// ---------------------------------------------------------------------------
async function runMasterReport(req, res, { spName, reportModule, fileName }) {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }
    const pool = await getPool(subDbName);
    const companyCode = parseInt(req.headers.companycode || req.query.CompanyCode || 0) || 0;

    const spReq = pool.request();
    // Status arrives as a (possibly comma-joined) filter value; only a single
    // 1 or 0 narrows the list — anything else (none / both) means ALL.
    const statusVals = String(req.query.Status ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (statusVals.length === 1 && statusVals[0] === '1') spReq.input('Status', sql.Bit, 1);
    else if (statusVals.length === 1 && statusVals[0] === '0') spReq.input('Status', sql.Bit, 0);

    const spResult = await spReq.execute(spName);
    const rows = spResult.recordset || [];
    const company = await getCompanyInfo(pool, companyCode);

    const docDef = reportModule.buildDocDefinition(rows, company.name, null, null, company.logo);
    addLogoToTitles(docDef, company.name, company.logo);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

// type → { stored proc, report module, download filename }. The whitelist is the
// security boundary — `groupBy` never builds a proc/module name directly.
const YARN_MASTER = {
  countName:    { sp: 'sp_CountName_GetAll',    mod: 'countName',    file: 'YarnMaster_CountName' },
  countType:    { sp: 'sp_CountType_GetAll',    mod: 'countType',    file: 'YarnMaster_CountType' },
  lotNo:        { sp: 'sp_LotNo_GetAll',        mod: 'lotNo',        file: 'YarnMaster_LotNo' },
  otherCharges: { sp: 'sp_OtherCharges_GetAll', mod: 'otherCharges', file: 'YarnMaster_OtherCharges' },
  salesType:    { sp: 'sp_SalesType_GetAll',    mod: 'salesType',    file: 'YarnMaster_SalesType' },
  taxType:      { sp: 'sp_TaxType_GetAll',      mod: 'taxType',      file: 'YarnMaster_TaxType' },
  tipColour:    { sp: 'sp_TipColour_GetAll',    mod: 'tipColour',    file: 'YarnMaster_TipColour' },
};

// GET /report/yarn/master?groupBy=<type>&Status=<1|0> — one master list as PDF.
export const handleYarnMasterReport = (req, res) => {
  const type = String(req.query.groupBy || req.query.type || '').trim();
  const def = YARN_MASTER[type];
  if (!def) return res.status(400).type('text/plain').send('Invalid or missing report type');
  return runMasterReport(req, res, {
    spName: def.sp,
    reportModule: yarnMasterReports[def.mod],
    fileName: def.file,
  });
};

// ---------------------------------------------------------------------------
// Yarn Prodn.(Packing) Reports (rptProduction). One screen, six report types,
// a date range + Company + six multi-select filters (Type / Supervisor /
// Employee / Count / Lot No / Tip Colour). Each type runs its SP with
// CompanyCode + FromDate + ToDate, then the rows are filtered IN JS by the
// selected codes — exactly as the VB does client-side (DataTable.Select). A
// filter is applied only when the SP's result actually has that column, so
// abstract/detail variants that lack a column simply ignore that filter.
// ---------------------------------------------------------------------------
function filterYarnProductionRows(rows, q) {
  if (!rows || !rows.length) return rows || [];
  const specs = [
    ['productionTypeCodes', 'YarnProductionTypeCode'],
    ['supervisorCodes', 'SupervisorCode'],
    ['employeeCodes', 'EmployeeCode'],
    ['countTypeCodes', 'CountTypeCode'],
    ['lotNoCodes', 'LotNoCode'],
    ['tipColourCodes', 'TipColourCode'],
  ];
  let out = rows;
  for (const [param, col] of specs) {
    const raw = String(q[param] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!raw.length) continue;
    if (!(col in (out[0] || {}))) continue; // column not in this SP's result → skip (VB-safe)
    const set = new Set(raw.map(String));
    out = out.filter((r) => set.has(String(r[col])));
  }
  return out;
}

async function runYarnProductionReport(req, res, { spName, reportModule, fileName }) {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const pool = await getPool(subDbName);
    const p = readParams(req);

    const spReq = pool.request();
    spReq.input('CompanyCode', sql.Int, parseInt(p.CompanyCode) || 0);
    spReq.input('FromDate', sql.DateTime, p.FromDate ? new Date(p.FromDate) : null);
    spReq.input('ToDate', sql.DateTime, p.ToDate ? new Date(p.ToDate) : null);
    const spResult = await spReq.execute(spName);

    const rows = filterYarnProductionRows(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, p.CompanyCode);

    const docDef = reportModule.buildDocDefinition(rows, company.name, p.FromDate, p.ToDate, company.logo);
    addLogoToTitles(docDef, company.name, company.logo);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

// type → { stored proc, report module, download filename }. `main` reuses a
// productionReport.js builder; `bag` uses a productionBagReports.js builder.
const YARN_PRODUCTION = {
  bagNoAbstract: { sp: 'sp_Production_Abstract', bag: 'bagNoAbstract', file: 'YarnProduction_BagNoAbstract' },
  dateWise: { sp: 'sp_BagProductionDetails_GetByRefDate', main: 'dateWise', file: 'YarnProduction_DateWise' },
  countAbstract: { sp: 'sp_BagProductionDetails_GetByRefDate', bag: 'countAbstract', file: 'YarnProduction_CountAbstract' },
  bagNoWise: { sp: 'sp_YarnProduction_GetAll', bag: 'bagNoWise', file: 'YarnProduction_BagNoWise' },
  countWise: { sp: 'sp_BagProductionDetails_GetByRefDate', main: 'countWise', file: 'YarnProduction_CountWise' },
  lotNoWise: { sp: 'sp_YarnProduction_GetAll', main: 'lotNoWise', file: 'YarnProduction_LotNoWise' },
};

// GET /report/yarn/production?groupBy=<type>&FromDate=&ToDate=&...filters
export const handleYarnProductionReport = (req, res) => {
  const type = String(req.query.groupBy || req.query.type || '').trim();
  const def = YARN_PRODUCTION[type];
  if (!def) return res.status(400).type('text/plain').send('Invalid or missing report type');
  const reportModule = def.main ? yarnProductionReport[def.main] : yarnProductionBagReports[def.bag];
  return runYarnProductionReport(req, res, { spName: def.sp, reportModule, fileName: def.file });
};

// GET /report/yarn/production-options — the six filter dropdown lists (JSON).
export const handleYarnProductionOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ error: 'Missing subDBName' });
    const pool = await getPool(subDbName);
    const q = (text) => pool.request().query(text).then((r) => r.recordset || []);
    const [pt, sup, emp, cnt, lot, tip] = await Promise.all([
      q('SELECT YarnProductionTypeCode, YarnProductionType FROM tbl_YarnProductionType'),
      q('SELECT SupervisorCode, SupervisorName FROM tbl_Supervisor'),
      q('SELECT EmployeeCode, EmployeeName FROM tbl_Employee'),
      q('SELECT CountTypeCode, CountName, ShortName, CountType FROM vw_CountType'),
      q('SELECT LotNoCode, LotNo FROM tbl_LotNo'),
      q('SELECT TipColourCode, TipColour FROM tbl_TipColour'),
    ]);
    res.json({
      data: {
        productionTypes: pt.map((r) => ({ value: r.YarnProductionTypeCode, label: r.YarnProductionType })),
        supervisors: sup.map((r) => ({ value: r.SupervisorCode, label: r.SupervisorName })),
        employees: emp.map((r) => ({ value: r.EmployeeCode, label: r.EmployeeName })),
        counts: cnt.map((r) => ({ value: r.CountTypeCode, label: r.CountName || r.ShortName || r.CountType })),
        lotNos: lot.map((r) => ({ value: r.LotNoCode, label: r.LotNo })),
        tipColours: tip.map((r) => ({ value: r.TipColourCode, label: r.TipColour })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// Sales Order Details Report (rptSalesOrderDetailsDateWise). One screen, five
// report types (Date / Customer / Agent / Sales Type / Count Wise) + a date
// range + Company + three multi-select filters (Customer / Sales Type / Count).
// All run sp_SalesOrderDetails_GetAll (CompanyCode + dates), then the rows are
// filtered IN JS by the selected codes — exactly as the VB does client-side.
// ---------------------------------------------------------------------------
function filterSalesOrderRows(rows, q) {
  if (!rows || !rows.length) return rows || [];
  const specs = [
    ['customerCodes', 'CustomerCode'],
    ['salesTypeCodes', 'SalesTypeCode'],
    ['countTypeCodes', 'CountTypeCode'],
  ];
  let out = rows;
  for (const [param, col] of specs) {
    const raw = String(q[param] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!raw.length) continue;
    if (!(col in (out[0] || {}))) continue;
    const set = new Set(raw.map(String));
    out = out.filter((r) => set.has(String(r[col])));
  }
  return out;
}

async function runYarnSalesOrderReport(req, res, { reportModule, fileName }) {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const pool = await getPool(subDbName);
    const p = readParams(req);

    const spReq = pool.request();
    spReq.input('CompanyCode', sql.Int, parseInt(p.CompanyCode) || 0);
    spReq.input('FromDate', sql.DateTime, p.FromDate ? new Date(p.FromDate) : null);
    spReq.input('ToDate', sql.DateTime, p.ToDate ? new Date(p.ToDate) : null);
    const spResult = await spReq.execute('sp_SalesOrderDetails_GetAll');

    const rows = filterSalesOrderRows(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, p.CompanyCode);

    const docDef = reportModule.buildDocDefinition(rows, company.name, p.FromDate, p.ToDate, company.logo);
    addLogoToTitles(docDef, company.name, company.logo);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

const YARN_SALES_ORDER = {
  dateWise: { mod: 'dateWise', file: 'SalesOrder_DateWise' },
  customerWise: { mod: 'customerWise', file: 'SalesOrder_CustomerWise' },
  agentWise: { mod: 'agentWise', file: 'SalesOrder_AgentWise' },
  salesTypeWise: { mod: 'salesTypeWise', file: 'SalesOrder_SalesTypeWise' },
  countWise: { mod: 'countWise', file: 'SalesOrder_CountWise' },
};

// GET /report/yarn/sales-order?groupBy=<type>&FromDate=&ToDate=&...filters
export const handleYarnSalesOrderReportMulti = (req, res) => {
  const type = String(req.query.groupBy || req.query.type || '').trim();
  const def = YARN_SALES_ORDER[type];
  if (!def) return res.status(400).type('text/plain').send('Invalid or missing report type');
  return runYarnSalesOrderReport(req, res, { reportModule: yarnSalesOrderReport[def.mod], fileName: def.file });
};

// GET /report/yarn/sales-order-options — Customer / Sales Type / Count dropdowns.
export const handleYarnSalesOrderReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ error: 'Missing subDBName' });
    const pool = await getPool(subDbName);
    const q = (text) => pool.request().query(text).then((r) => r.recordset || []);
    const [cust, st, cnt] = await Promise.all([
      q('SELECT CustomerCode, CustomerName FROM vw_Customer'),
      q('SELECT SalesTypeCode, SalesType FROM tbl_SalesType'),
      q('SELECT CountTypeCode, CountName, ShortName, CountType FROM vw_CountType'),
    ]);
    res.json({
      data: {
        customers: cust.map((r) => ({ value: r.CustomerCode, label: r.CustomerName })),
        salesTypes: st.map((r) => ({ value: r.SalesTypeCode, label: r.SalesType })),
        counts: cnt.map((r) => ({ value: r.CountTypeCode, label: r.CountType || r.CountName || r.ShortName })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// Sales Invoice Reports (rptInvoiceDateWise). One screen, the sp_InvoiceDetails_GetAll
// report family: Date / Customer / Agent / Sales Type / Count / Vehicle / Driver /
// Transporter / Delivery Wise + Avg Rate (Count Wise) — plus a date range + Company
// + Customer / Sales Type / Count / Agent multi-select filters. All run
// sp_InvoiceDetails_GetAll (CompanyCode + dates), then the rows are filtered IN JS
// by the selected codes — exactly as the VB does client-side.
// ---------------------------------------------------------------------------
function filterYarnInvoiceRows(rows, q) {
  if (!rows || !rows.length) return rows || [];
  const specs = [
    ['customerCodes', 'CustomerCode'],
    ['salesTypeCodes', 'SalesTypeCode'],
    ['countTypeCodes', 'CountTypeCode'],
    ['agentCodes', 'AgentCode'],
  ];
  let out = rows;
  for (const [param, col] of specs) {
    const raw = String(q[param] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!raw.length) continue;
    if (!(col in (out[0] || {}))) continue;
    const set = new Set(raw.map(String));
    out = out.filter((r) => set.has(String(r[col])));
  }
  return out;
}

async function runYarnInvoiceReport(req, res, { reportModule, fileName }) {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const pool = await getPool(subDbName);
    const p = readParams(req);

    const spReq = pool.request();
    spReq.input('CompanyCode', sql.Int, parseInt(p.CompanyCode) || 0);
    spReq.input('FromDate', sql.DateTime, p.FromDate ? new Date(p.FromDate) : null);
    spReq.input('ToDate', sql.DateTime, p.ToDate ? new Date(p.ToDate) : null);
    const spResult = await spReq.execute('sp_InvoiceDetails_GetAll');

    const rows = filterYarnInvoiceRows(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, p.CompanyCode);

    const docDef = reportModule.buildDocDefinition(rows, company.name, p.FromDate, p.ToDate, company.logo);
    addLogoToTitles(docDef, company.name, company.logo);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

const YARN_INVOICE_REPORT = {
  dateWise:         { mod: 'dateWise',         file: 'YarnInvoice_DateWise' },
  customerWise:     { mod: 'customerWise',     file: 'YarnInvoice_CustomerWise' },
  agentWise:        { mod: 'agentWise',        file: 'YarnInvoice_AgentWise' },
  salesTypeWise:    { mod: 'salesTypeWise',    file: 'YarnInvoice_SalesTypeWise' },
  countWise:        { mod: 'countWise',        file: 'YarnInvoice_CountWise' },
  vehicleWise:      { mod: 'vehicleWise',      file: 'YarnInvoice_VehicleWise' },
  driverWise:       { mod: 'driverWise',       file: 'YarnInvoice_DriverWise' },
  transporterWise:  { mod: 'transporterWise',  file: 'YarnInvoice_TransporterWise' },
  deliveryWise:     { mod: 'deliveryWise',     file: 'YarnInvoice_DeliveryWise' },
  avgRateCountWise: { mod: 'avgRateCountWise', file: 'YarnInvoice_AvgRateCountWise' },
};

// GET /report/yarn/sales-invoice?groupBy=<type>&FromDate=&ToDate=&CompanyCode=&...filters
export const handleYarnInvoiceReportMulti = (req, res) => {
  const type = String(req.query.groupBy || req.query.type || '').trim();
  const def = YARN_INVOICE_REPORT[type];
  if (!def) return res.status(400).type('text/plain').send('Invalid or missing report type');
  return runYarnInvoiceReport(req, res, { reportModule: yarnInvoiceReport[def.mod], fileName: def.file });
};

// GET /report/yarn/sales-invoice-options — Customer / Sales Type / Count / Agent dropdowns.
export const handleYarnInvoiceReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ error: 'Missing subDBName' });
    const pool = await getPool(subDbName);
    const q = (text) => pool.request().query(text).then((r) => r.recordset || []);
    const [cust, st, cnt, agents] = await Promise.all([
      q('SELECT CustomerCode, CustomerName FROM vw_Customer'),
      q('SELECT SalesTypeCode, SalesType FROM tbl_SalesType'),
      q('SELECT CountTypeCode, CountName, ShortName, CountType FROM vw_CountType'),
      q('SELECT AgentCode, AgentName FROM tbl_Agent WHERE Yarn = 1 ORDER BY AgentName'),
    ]);
    res.json({
      data: {
        customers: cust.map((r) => ({ value: r.CustomerCode, label: r.CustomerName })),
        salesTypes: st.map((r) => ({ value: r.SalesTypeCode, label: r.SalesType })),
        counts: cnt.map((r) => ({ value: r.CountTypeCode, label: r.CountType || r.CountName || r.ShortName })),
        agents: agents.map((r) => ({ value: r.AgentCode, label: r.AgentName })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// Sales Order Pendings Report (rptPendingDespatchOrder). Three report types
// (Pending matrix / Detailed / Pending Summary) + a date range + Company + three
// multi-select filters (Agent / Customer / Count). All run
// sp_Pending_InvoiceList_GetAll (CompanyCode + dates), then JS-filter the rows by
// the selected codes — as the VB does client-side.
// ---------------------------------------------------------------------------
function filterSalesOrderPendingRows(rows, q) {
  if (!rows || !rows.length) return rows || [];
  const specs = [
    ['agentCodes', 'AgentCode'],
    ['customerCodes', 'CustomerCode'],
    ['countTypeCodes', 'CountTypeCode'],
  ];
  let out = rows;
  for (const [param, col] of specs) {
    const raw = String(q[param] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!raw.length) continue;
    if (!(col in (out[0] || {}))) continue;
    const set = new Set(raw.map(String));
    out = out.filter((r) => set.has(String(r[col])));
  }
  return out;
}

async function runYarnSalesOrderPendingReport(req, res, { reportModule, fileName }) {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const pool = await getPool(subDbName);
    const p = readParams(req);

    const spReq = pool.request();
    spReq.input('CompanyCode', sql.Int, parseInt(p.CompanyCode) || 0);
    spReq.input('FromDate', sql.DateTime, p.FromDate ? new Date(p.FromDate) : null);
    spReq.input('ToDate', sql.DateTime, p.ToDate ? new Date(p.ToDate) : null);
    const spResult = await spReq.execute('sp_Pending_InvoiceList_GetAll');

    const rows = filterSalesOrderPendingRows(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, p.CompanyCode);

    const docDef = reportModule.buildDocDefinition(rows, company.name, p.FromDate, p.ToDate, company.logo);
    addLogoToTitles(docDef, company.name, company.logo);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

const YARN_SO_PENDING = {
  pending: { mod: 'pending', file: 'SalesOrderPending_Pending' },
  detailed: { mod: 'detailed', file: 'SalesOrderPending_Detailed' },
  summary: { mod: 'summary', file: 'SalesOrderPending_Summary' },
};

// GET /report/yarn/sales-order-pending?groupBy=<type>&FromDate=&ToDate=&...filters
export const handleYarnSalesOrderPendingMulti = (req, res) => {
  const type = String(req.query.groupBy || req.query.type || '').trim();
  const def = YARN_SO_PENDING[type];
  if (!def) return res.status(400).type('text/plain').send('Invalid or missing report type');
  return runYarnSalesOrderPendingReport(req, res, { reportModule: yarnSalesOrderPendingReport[def.mod], fileName: def.file });
};

// GET /report/yarn/sales-order-pending-options — Agent / Customer / Count dropdowns.
export const handleYarnSalesOrderPendingOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ error: 'Missing subDBName' });
    const pool = await getPool(subDbName);
    const q = (text) => pool.request().query(text).then((r) => r.recordset || []);
    const [agents, cust, cnt] = await Promise.all([
      q('SELECT AgentCode, AgentName FROM tbl_Agent WHERE Yarn = 1 ORDER BY AgentName'),
      q('SELECT CustomerCode, CustomerName FROM vw_Customer'),
      q('SELECT CountTypeCode, CountType, CountName, ShortName FROM vw_CountType'),
    ]);
    res.json({
      data: {
        agents: agents.map((r) => ({ value: r.AgentCode, label: r.AgentName })),
        customers: cust.map((r) => ({ value: r.CustomerCode, label: r.CustomerName })),
        counts: cnt.map((r) => ({ value: r.CountTypeCode, label: r.CountType || r.CountName || r.ShortName })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// Yarn Purchase Order Reports (rptYarnPurchaseOrderDetailsCountTypeWise). One
// screen, seven report types + a date range + Company + a Supplier multi-select.
//   - Summary (Date / Supplier / Approval)  -> sp_YarnPurchaseOrder_GetAll
//   - Approval Pending                       -> sp_YarnPurchaseOrder_GetAll_Pending
//   - Detail (Count / Date / Supplier Wise)  -> sp_YarnPurchaseOrderDetails_GetAll
// Approval passes @Approval=1, Pending passes @Approval=0 and NO dates — exactly
// as the VB does. Rows are then filtered IN JS by the selected supplier codes.
// ---------------------------------------------------------------------------
function filterYarnPurchaseOrderRows(rows, q) {
  if (!rows || !rows.length) return rows || [];
  const raw = String(q.supplierCodes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!raw.length) return rows;
  if (!('SupplierCode' in (rows[0] || {}))) return rows;
  const set = new Set(raw.map(String));
  return rows.filter((r) => set.has(String(r.SupplierCode)));
}

async function runYarnPurchaseOrderReport(req, res, { spName, reportModule, fileName, approval, noDates }) {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const pool = await getPool(subDbName);
    const p = readParams(req);

    const spReq = pool.request();
    spReq.input('CompanyCode', sql.Int, parseInt(p.CompanyCode) || 0);
    if (!noDates) {
      spReq.input('FromDate', sql.DateTime, p.FromDate ? new Date(p.FromDate) : null);
      spReq.input('ToDate', sql.DateTime, p.ToDate ? new Date(p.ToDate) : null);
    }
    if (approval !== undefined) spReq.input('Approval', sql.Bit, approval);
    const spResult = await spReq.execute(spName);

    const rows = filterYarnPurchaseOrderRows(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, p.CompanyCode);

    const docDef = reportModule.buildDocDefinition(rows, company.name, p.FromDate, p.ToDate, company.logo);
    addLogoToTitles(docDef, company.name, company.logo);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

const YARN_PO_REPORT = {
  dateWise:             { sp: 'sp_YarnPurchaseOrder_GetAll',         mod: 'summaryDateWise',     file: 'YarnPO_DateWise' },
  supplierWise:         { sp: 'sp_YarnPurchaseOrder_GetAll',         mod: 'summarySupplierWise', file: 'YarnPO_SupplierWise' },
  approval:             { sp: 'sp_YarnPurchaseOrder_GetAll',         mod: 'approvalDateWise',    file: 'YarnPO_Approval', approval: 1 },
  approvalPending:      { sp: 'sp_YarnPurchaseOrder_GetAll_Pending', mod: 'pendingDateWise',     file: 'YarnPO_ApprovalPending', approval: 0, noDates: true },
  countWise:            { sp: 'sp_YarnPurchaseOrderDetails_GetAll',  mod: 'countWise',           file: 'YarnPO_CountWise' },
  dateWiseDetailed:     { sp: 'sp_YarnPurchaseOrderDetails_GetAll',  mod: 'dateWise',            file: 'YarnPO_DateWiseDetailed' },
  supplierWiseDetailed: { sp: 'sp_YarnPurchaseOrderDetails_GetAll',  mod: 'supplierWise',        file: 'YarnPO_SupplierWiseDetailed' },
};

// GET /report/yarn/purchase-order-report?groupBy=<type>&FromDate=&ToDate=&CompanyCode=&supplierCodes=
export const handleYarnPurchaseOrderReportMulti = (req, res) => {
  const type = String(req.query.groupBy || req.query.type || '').trim();
  const def = YARN_PO_REPORT[type];
  if (!def) return res.status(400).type('text/plain').send('Invalid or missing report type');
  return runYarnPurchaseOrderReport(req, res, {
    spName: def.sp,
    reportModule: yarnPurchaseOrderReport[def.mod],
    fileName: def.file,
    approval: def.approval,
    noDates: def.noDates,
  });
};

// GET /report/yarn/purchase-order-report-options — Supplier dropdown.
export const handleYarnPurchaseOrderReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ error: 'Missing subDBName' });
    const pool = await getPool(subDbName);
    const suppliers = await pool
      .request()
      .query('SELECT SupplierCode, SupplierName FROM tbl_Supplier WHERE Status = 1 AND SupplierID IS NOT NULL ORDER BY SupplierName')
      .then((r) => r.recordset || []);
    res.json({
      data: {
        suppliers: suppliers.map((r) => ({ value: r.SupplierCode, label: r.SupplierName })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// Yarn GRN (Inward) Reports (rptYarnGRNDetailsDateWise). One screen, four report
// types + a date range + Company + Supplier & Lot No multi-selects.
//   - Date Wise (summary)                         -> sp_YarnGRN_GetAll
//   - Date Wise (Detailed) / Lot No / Supplier    -> sp_YarnGRNDetails_GetAll
// Rows are then filtered IN JS by the selected supplier + lot-no codes — exactly
// as the VB filters the DataTable client-side (Lot No only applies to detail SP).
// ---------------------------------------------------------------------------
function filterYarnGrnRows(rows, q) {
  if (!rows || !rows.length) return rows || [];
  const specs = [
    ['supplierCodes', 'SupplierCode'],
    ['lotNoCodes', 'LotNoCode'],
  ];
  let out = rows;
  for (const [param, col] of specs) {
    const raw = String(q[param] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!raw.length) continue;
    if (!(col in (out[0] || {}))) continue;
    const set = new Set(raw.map(String));
    out = out.filter((r) => set.has(String(r[col])));
  }
  return out;
}

async function runYarnGrnReport(req, res, { spName, reportModule, fileName }) {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const pool = await getPool(subDbName);
    const p = readParams(req);

    const spReq = pool.request();
    spReq.input('CompanyCode', sql.Int, parseInt(p.CompanyCode) || 0);
    spReq.input('FromDate', sql.DateTime, p.FromDate ? new Date(p.FromDate) : null);
    spReq.input('ToDate', sql.DateTime, p.ToDate ? new Date(p.ToDate) : null);
    const spResult = await spReq.execute(spName);

    const rows = filterYarnGrnRows(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, p.CompanyCode);

    const docDef = reportModule.buildDocDefinition(rows, company.name, p.FromDate, p.ToDate, company.logo);
    addLogoToTitles(docDef, company.name, company.logo);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

const YARN_GRN_REPORT = {
  dateWise:         { sp: 'sp_YarnGRN_GetAll',        mod: 'dateWise',         file: 'YarnGRN_DateWise' },
  dateWiseDetailed: { sp: 'sp_YarnGRNDetails_GetAll', mod: 'dateWiseDetailed', file: 'YarnGRN_DateWiseDetailed' },
  lotNoWise:        { sp: 'sp_YarnGRNDetails_GetAll', mod: 'lotNoWise',        file: 'YarnGRN_LotNoWise' },
  supplierWise:     { sp: 'sp_YarnGRNDetails_GetAll', mod: 'supplierWise',     file: 'YarnGRN_SupplierWise' },
};

// GET /report/yarn/grn-report?groupBy=<type>&FromDate=&ToDate=&CompanyCode=&supplierCodes=&lotNoCodes=
export const handleYarnGrnReportMulti = (req, res) => {
  const type = String(req.query.groupBy || req.query.type || '').trim();
  const def = YARN_GRN_REPORT[type];
  if (!def) return res.status(400).type('text/plain').send('Invalid or missing report type');
  return runYarnGrnReport(req, res, { spName: def.sp, reportModule: yarnGrnReport[def.mod], fileName: def.file });
};

// GET /report/yarn/grn-report-options — Supplier + Lot No dropdowns.
export const handleYarnGrnReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ error: 'Missing subDBName' });
    const pool = await getPool(subDbName);
    const q = (text) => pool.request().query(text).then((r) => r.recordset || []);
    const [suppliers, lotNos] = await Promise.all([
      q('SELECT SupplierCode, SupplierName FROM tbl_Supplier WHERE Status = 1 AND SupplierID IS NOT NULL ORDER BY SupplierName'),
      q('SELECT LotNoCode, LotNo FROM tbl_LotNo ORDER BY LotNo'),
    ]);
    res.json({
      data: {
        suppliers: suppliers.map((r) => ({ value: r.SupplierCode, label: r.SupplierName })),
        lotNos: lotNos.map((r) => ({ value: r.LotNoCode, label: r.LotNo })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const handleReport = (req, res) => runReport(req, res, {
  spName: 'sp_PurchaseOrderDetails_GetAll',
  reportModule: poDetails,
  fileName: 'PurchaseOrderDetails'
});

export const handleSupplierWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_PurchaseOrderDetails_GetAll',
  reportModule: poSupplierWise,
  fileName: 'PurchaseOrder_SupplierWise'
});

export const handleItemWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_PurchaseOrderDetails_GetAll',
  reportModule: poItemWise,
  fileName: 'PurchaseOrder_ItemWise'
});

export const handleCategoryWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_PurchaseOrderDetails_GetAll',
  reportModule: poCategoryWise,
  fileName: 'PurchaseOrder_CategoryWise'
});

export const handleCostHeadWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_PurchaseOrderDetails_GetAll',
  reportModule: poCostHeadWise,
  fileName: 'PurchaseOrder_CostHeadWise'
});

export const handlePendingCategoryWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_RptPurchaseOrderDetailsPending',
  reportModule: poPendingCategoryWise,
  fileName: 'PurchaseOrderPending_CategoryWise'
});

export const handlePendingItemWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_RptPurchaseOrderDetailsPending',
  reportModule: poPendingItemWise,
  fileName: 'PurchaseOrderPending_ItemWise'
});

export const handlePendingSupplierWiseReport = (req, res) => runReport(req, res, {
  spName: 'sp_RptPurchaseOrderDetailsPending',
  reportModule: poPendingSupplierWise,
  fileName: 'PurchaseOrderPending_SupplierWise'
});

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

// ---------------------------------------------------------------------------
// Yarn Agent Commission Reports (rptYarnAgentCommissionDetails). One screen,
// three report types + a date range + Company + an Agent multi-select.
//   - Date Wise / Agent Wise ("Details") -> sp_YarnAgentCommission_GetAll
//   - List                               -> sp_AgentCommissionList (different SP)
// Rows are then filtered IN JS by the selected agent codes — as the VB does
// client-side (DataResult.Select("AgentCode IN (...)")).
// ---------------------------------------------------------------------------
function filterYarnAgentCommissionRows(rows, q) {
  if (!rows || !rows.length) return rows || [];
  const raw = String(q.agentCodes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!raw.length) return rows;
  if (!('AgentCode' in (rows[0] || {}))) return rows;
  const set = new Set(raw.map(String));
  return rows.filter((r) => set.has(String(r.AgentCode)));
}

async function runYarnAgentCommissionReport(req, res, { spName, reportModule, fileName }) {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const pool = await getPool(subDbName);
    const p = readParams(req);

    const spReq = pool.request();
    spReq.input('CompanyCode', sql.Int, parseInt(p.CompanyCode) || 0);
    spReq.input('FromDate', sql.DateTime, p.FromDate ? new Date(p.FromDate) : null);
    spReq.input('ToDate', sql.DateTime, p.ToDate ? new Date(p.ToDate) : null);
    const spResult = await spReq.execute(spName);

    const rows = filterYarnAgentCommissionRows(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, p.CompanyCode);

    const docDef = reportModule.buildDocDefinition(rows, company.name, p.FromDate, p.ToDate, company.logo);
    addLogoToTitles(docDef, company.name, company.logo);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

const YARN_AGENT_COMMISSION_REPORT = {
  dateWise:  { sp: 'sp_YarnAgentCommission_GetAll', mod: 'dateWise',  file: 'YarnAgentCommission_DateWise' },
  agentWise: { sp: 'sp_YarnAgentCommission_GetAll', mod: 'agentWise', file: 'YarnAgentCommission_AgentWise' },
  list:      { sp: 'sp_AgentCommissionList',        mod: 'list',      file: 'YarnAgentCommission_List' },
};

// GET /report/yarn/agent-commission?groupBy=<type>&FromDate=&ToDate=&CompanyCode=&agentCodes=
export const handleYarnAgentCommissionReportMulti = (req, res) => {
  const type = String(req.query.groupBy || req.query.type || '').trim();
  const def = YARN_AGENT_COMMISSION_REPORT[type];
  if (!def) return res.status(400).type('text/plain').send('Invalid or missing report type');
  return runYarnAgentCommissionReport(req, res, { spName: def.sp, reportModule: yarnAgentCommissionReport[def.mod], fileName: def.file });
};

// GET /report/yarn/agent-commission-options — Agent dropdown.
export const handleYarnAgentCommissionReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ error: 'Missing subDBName' });
    const pool = await getPool(subDbName);
    const agents = await pool
      .request()
      .query('SELECT AgentCode, AgentName FROM tbl_Agent WHERE Yarn = 1 ORDER BY AgentName')
      .then((r) => r.recordset || []);
    res.json({
      data: {
        agents: agents.map((r) => ({ value: r.AgentCode, label: r.AgentName })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// Yarn Transport (Freight) Invoice Reports (rptTransportInvoiceDetails). One
// screen, two report types + a date range + Company + a Transport Name
// multi-select.
//   - Date Wise        -> sp_TransportInvoice_GetAll, grouped by Trans. Inv Date
//   - Transporter Wise -> sp_TransportInvoice_GetAll, grouped by Transporter
// Rows are then filtered IN JS by the selected transporter codes — exactly as
// the VB does client-side (DataResult.Select("TransporterCode IN (...)")).
// ---------------------------------------------------------------------------
function filterYarnTransportInvoiceRows(rows, q) {
  if (!rows || !rows.length) return rows || [];
  const raw = String(q.transporterCodes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!raw.length) return rows;
  if (!('TransporterCode' in (rows[0] || {}))) return rows;
  const set = new Set(raw.map(String));
  return rows.filter((r) => set.has(String(r.TransporterCode)));
}

async function runYarnTransportInvoiceReport(req, res, { reportModule, fileName }) {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const pool = await getPool(subDbName);
    const p = readParams(req);

    const spReq = pool.request();
    spReq.input('CompanyCode', sql.Int, parseInt(p.CompanyCode) || 0);
    spReq.input('FromDate', sql.DateTime, p.FromDate ? new Date(p.FromDate) : null);
    spReq.input('ToDate', sql.DateTime, p.ToDate ? new Date(p.ToDate) : null);
    const spResult = await spReq.execute('sp_TransportInvoice_GetAll');

    const rows = filterYarnTransportInvoiceRows(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, p.CompanyCode);

    const docDef = reportModule.buildDocDefinition(rows, company.name, p.FromDate, p.ToDate, company.logo);
    addLogoToTitles(docDef, company.name, company.logo);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

const YARN_TRANSPORT_INVOICE_REPORT = {
  dateWise:        { mod: 'dateWise',        file: 'YarnTransportInvoice_DateWise' },
  transporterWise: { mod: 'transporterWise', file: 'YarnTransportInvoice_TransporterWise' },
};

// GET /report/yarn/transport-invoice?groupBy=<type>&FromDate=&ToDate=&CompanyCode=&transporterCodes=
export const handleYarnTransportInvoiceReportMulti = (req, res) => {
  const type = String(req.query.groupBy || req.query.type || '').trim();
  const def = YARN_TRANSPORT_INVOICE_REPORT[type];
  if (!def) return res.status(400).type('text/plain').send('Invalid or missing report type');
  return runYarnTransportInvoiceReport(req, res, { reportModule: yarnTransportInvoiceReport[def.mod], fileName: def.file });
};

// GET /report/yarn/transport-invoice-options — Transport Name dropdown.
export const handleYarnTransportInvoiceReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ error: 'Missing subDBName' });
    const pool = await getPool(subDbName);
    const transporters = await pool
      .request()
      .query('SELECT TransporterCode, TransporterName FROM tbl_Transporter ORDER BY TransporterName')
      .then((r) => r.recordset || []);
    res.json({
      data: {
        transporters: transporters.map((r) => ({ value: r.TransporterCode, label: r.TransporterName })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

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

