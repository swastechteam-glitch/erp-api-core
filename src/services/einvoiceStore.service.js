// ---------------------------------------------------------------------------
// E-Invoice store service — persists generated IRN / E-Way-Bill records into
// dbo.tbl_GST_EInvoice (the "final data" table).
//
//   ensureEInvoiceTable(pool)      -> creates tbl_GST_EInvoice if missing (idempotent)
//   saveEInvoiceRecord(pool, rec)  -> upsert one document (by Company+FY+SalesType+DocNo)
//
// The table is created per sub-database on first save, so no manual migration is
// needed (db/tbl_GST_EInvoice.sql is the same DDL for a manual apply).
// ---------------------------------------------------------------------------

import sql from "mssql";

// Idempotent DDL — must match db/tbl_GST_EInvoice.sql (kept in one batch, no GO).
export const EINVOICE_TABLE_DDL = `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tbl_GST_EInvoice' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.tbl_GST_EInvoice (
    EInvoiceCode      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tbl_GST_EInvoice PRIMARY KEY,
    CompanyCode       INT NULL, FYCode INT NULL,
    SalesType         VARCHAR(30) NULL, SourceView VARCHAR(64) NULL,
    SalesDayBookCode  INT NULL, RefCode INT NULL,
    DocumentType      VARCHAR(10) NULL, DocumentNo VARCHAR(50) NULL, DocumentDate DATETIME NULL,
    VendorCode        INT NULL, CustomerName NVARCHAR(250) NULL, BuyerGSTIN VARCHAR(20) NULL,
    TaxableValue      DECIMAL(18,2) NULL, CGSTValue DECIMAL(18,2) NULL, SGSTValue DECIMAL(18,2) NULL,
    IGSTValue         DECIMAL(18,2) NULL, CessValue DECIMAL(18,2) NULL, OtherCharges DECIMAL(18,2) NULL,
    RoundOff          DECIMAL(18,2) NULL, TotalValue DECIMAL(18,2) NULL,
    IRP               VARCHAR(10) NULL, IRN VARCHAR(72) NULL, AckNo VARCHAR(30) NULL, AckDate DATETIME NULL,
    SignedInvoice     NVARCHAR(MAX) NULL, SignedQRCode NVARCHAR(MAX) NULL,
    EWayBillNo        VARCHAR(20) NULL, EWayBillDate DATETIME NULL, EWayBillValidUpto DATETIME NULL,
    IRNStatus         VARCHAR(15) NOT NULL CONSTRAINT DF_GST_EInvoice_IRNStatus DEFAULT ('ACTIVE'),
    CancelReason      VARCHAR(10) NULL, CancelRemarks NVARCHAR(200) NULL, CancelDate DATETIME NULL,
    EWBStatus         VARCHAR(15) NULL, EWBCancelReason VARCHAR(10) NULL, EWBCancelRemarks NVARCHAR(200) NULL, EWBCancelDate DATETIME NULL,
    RequestJSON       NVARCHAR(MAX) NULL, ResponseJSON NVARCHAR(MAX) NULL,
    CreatedBy         VARCHAR(60) NULL,
    CreatedDate       DATETIME NOT NULL CONSTRAINT DF_GST_EInvoice_Created DEFAULT (GETDATE()),
    ModifiedDate      DATETIME NULL
  );
  CREATE UNIQUE INDEX UX_GST_EInvoice_Doc ON dbo.tbl_GST_EInvoice (CompanyCode, FYCode, SalesType, DocumentNo) WHERE DocumentNo IS NOT NULL;
  CREATE INDEX IX_GST_EInvoice_DocDate ON dbo.tbl_GST_EInvoice (CompanyCode, DocumentDate);
  CREATE INDEX IX_GST_EInvoice_IRN ON dbo.tbl_GST_EInvoice (IRN);
END`;

// Create the table if it's missing. Cached per pool so it runs at most once.
const ensured = new WeakSet();
export async function ensureEInvoiceTable(pool) {
  if (!pool || ensured.has(pool)) return;
  await pool.request().batch(EINVOICE_TABLE_DDL);
  ensured.add(pool);
}

// ---- coercion helpers ------------------------------------------------------
const int = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};
const dec = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const date = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const strv = (v) => (v === null || v === undefined ? null : String(v));

// Bind every column input onto a request (used by both INSERT and UPDATE).
function bindInputs(req, r) {
  req.input("CompanyCode", sql.Int, int(r.companyCode));
  req.input("FYCode", sql.Int, int(r.fyCode));
  req.input("SalesType", sql.VarChar(30), strv(r.salesType));
  req.input("SourceView", sql.VarChar(64), strv(r.sourceView));
  req.input("SalesDayBookCode", sql.Int, int(r.salesDayBookCode));
  req.input("RefCode", sql.Int, int(r.refCode));
  req.input("DocumentType", sql.VarChar(10), strv(r.documentType));
  req.input("DocumentNo", sql.VarChar(50), strv(r.documentNo));
  req.input("DocumentDate", sql.DateTime, date(r.documentDate));
  req.input("VendorCode", sql.Int, int(r.vendorCode));
  req.input("CustomerName", sql.NVarChar(250), strv(r.customerName));
  req.input("BuyerGSTIN", sql.VarChar(20), strv(r.buyerGstin));
  req.input("TaxableValue", sql.Decimal(18, 2), dec(r.taxableValue));
  req.input("CGSTValue", sql.Decimal(18, 2), dec(r.cgstValue));
  req.input("SGSTValue", sql.Decimal(18, 2), dec(r.sgstValue));
  req.input("IGSTValue", sql.Decimal(18, 2), dec(r.igstValue));
  req.input("CessValue", sql.Decimal(18, 2), dec(r.cessValue));
  req.input("OtherCharges", sql.Decimal(18, 2), dec(r.otherCharges));
  req.input("RoundOff", sql.Decimal(18, 2), dec(r.roundOff));
  req.input("TotalValue", sql.Decimal(18, 2), dec(r.totalValue));
  req.input("IRP", sql.VarChar(10), strv(r.irp));
  req.input("IRN", sql.VarChar(72), strv(r.irn));
  req.input("AckNo", sql.VarChar(30), strv(r.ackNo));
  req.input("AckDate", sql.DateTime, date(r.ackDate));
  req.input("SignedInvoice", sql.NVarChar(sql.MAX), strv(r.signedInvoice));
  req.input("SignedQRCode", sql.NVarChar(sql.MAX), strv(r.signedQRCode));
  req.input("EWayBillNo", sql.VarChar(20), strv(r.ewayBillNo));
  req.input("EWayBillDate", sql.DateTime, date(r.ewayBillDate));
  req.input("EWayBillValidUpto", sql.DateTime, date(r.ewayBillValidUpto));
  req.input("IRNStatus", sql.VarChar(15), strv(r.irnStatus) || "ACTIVE");
  req.input("RequestJSON", sql.NVarChar(sql.MAX), strv(r.requestJson));
  req.input("ResponseJSON", sql.NVarChar(sql.MAX), strv(r.responseJson));
  req.input("CreatedBy", sql.VarChar(60), strv(r.createdBy));
}

const COLS = [
  "CompanyCode", "FYCode", "SalesType", "SourceView", "SalesDayBookCode", "RefCode",
  "DocumentType", "DocumentNo", "DocumentDate", "VendorCode", "CustomerName", "BuyerGSTIN",
  "TaxableValue", "CGSTValue", "SGSTValue", "IGSTValue", "CessValue", "OtherCharges", "RoundOff", "TotalValue",
  "IRP", "IRN", "AckNo", "AckDate", "SignedInvoice", "SignedQRCode",
  "EWayBillNo", "EWayBillDate", "EWayBillValidUpto", "IRNStatus", "RequestJSON", "ResponseJSON", "CreatedBy",
];

// Upsert one document. Matches on (CompanyCode, FYCode, SalesType, DocumentNo)
// when a DocumentNo is present; otherwise always inserts. Returns EInvoiceCode.
export async function saveEInvoiceRecord(pool, record) {
  await ensureEInvoiceTable(pool);
  const r = record || {};

  // Find an existing row for this document (upsert key).
  let existingId = null;
  if (r.documentNo) {
    const q = await pool
      .request()
      .input("CompanyCode", sql.Int, int(r.companyCode))
      .input("FYCode", sql.Int, int(r.fyCode))
      .input("SalesType", sql.VarChar(30), strv(r.salesType))
      .input("DocumentNo", sql.VarChar(50), strv(r.documentNo))
      .query(
        `SELECT TOP 1 EInvoiceCode FROM dbo.tbl_GST_EInvoice
          WHERE CompanyCode = @CompanyCode
            AND ISNULL(FYCode,-1) = ISNULL(@FYCode,-1)
            AND ISNULL(SalesType,'') = ISNULL(@SalesType,'')
            AND DocumentNo = @DocumentNo`
      );
    existingId = q.recordset?.[0]?.EInvoiceCode ?? null;
  }

  if (existingId) {
    const req = pool.request();
    bindInputs(req, r);
    req.input("EInvoiceCode", sql.Int, existingId);
    const setList = COLS.map((c) => `${c} = @${c}`).join(", ");
    await req.query(
      `UPDATE dbo.tbl_GST_EInvoice SET ${setList}, ModifiedDate = GETDATE()
        WHERE EInvoiceCode = @EInvoiceCode`
    );
    return existingId;
  }

  const req = pool.request();
  bindInputs(req, r);
  const ins = await req.query(
    `INSERT INTO dbo.tbl_GST_EInvoice (${COLS.join(", ")})
     OUTPUT INSERTED.EInvoiceCode
     VALUES (${COLS.map((c) => "@" + c).join(", ")})`
  );
  return ins.recordset?.[0]?.EInvoiceCode ?? null;
}

export default { ensureEInvoiceTable, saveEInvoiceRecord, EINVOICE_TABLE_DDL };
