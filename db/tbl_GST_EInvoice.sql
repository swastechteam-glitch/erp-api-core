-- ============================================================================
-- tbl_GST_EInvoice — final store for generated GST E-Invoice (IRN) + E-Way-Bill
-- ============================================================================
-- One row per document that has been (or is being) pushed to the IRP. Source
-- documents come from the sales-type views (each tbl_SalesDayBook row carries a
-- SalesType):
--     YARN_SALES    -> vw_InvoiceDetails
--     SCRAP_SALES   -> vw_ScrapInvoiceDetails
--     WASTE_SALES   -> vw_WasteInvoiceDetails
--     GENERAL_SALES -> vw_GeneralSalesDetails
--     COTTON_SALES  -> vw_CottonSalesDetails
--
-- Idempotent: safe to run repeatedly (creates the table + unique index only if
-- missing). The API also self-creates it on first save (ensureEInvoiceTable).
-- Run this once per sub-database (each company DB) if you prefer a manual apply.
-- ============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'tbl_GST_EInvoice' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.tbl_GST_EInvoice (
        EInvoiceCode        INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_tbl_GST_EInvoice PRIMARY KEY,

        -- scope / source
        CompanyCode         INT           NULL,
        FYCode              INT           NULL,
        SalesType           VARCHAR(30)   NULL,   -- YARN_SALES / SCRAP_SALES / ...
        SourceView          VARCHAR(64)   NULL,   -- vw_InvoiceDetails / ...
        SalesDayBookCode    INT           NULL,   -- FK-ish -> tbl_SalesDayBook
        RefCode             INT           NULL,

        -- document
        DocumentType        VARCHAR(10)   NULL,   -- INV / CRN / DBN
        DocumentNo          VARCHAR(50)   NULL,
        DocumentDate        DATETIME      NULL,
        VendorCode          INT           NULL,
        CustomerName        NVARCHAR(250) NULL,
        BuyerGSTIN          VARCHAR(20)   NULL,

        -- values
        TaxableValue        DECIMAL(18,2) NULL,
        CGSTValue           DECIMAL(18,2) NULL,
        SGSTValue           DECIMAL(18,2) NULL,
        IGSTValue           DECIMAL(18,2) NULL,
        CessValue           DECIMAL(18,2) NULL,
        OtherCharges        DECIMAL(18,2) NULL,
        RoundOff            DECIMAL(18,2) NULL,
        TotalValue          DECIMAL(18,2) NULL,

        -- IRP / IRN response
        IRP                 VARCHAR(10)   NULL,   -- NIC1 / NIC2
        IRN                 VARCHAR(72)   NULL,
        AckNo               VARCHAR(30)   NULL,
        AckDate             DATETIME      NULL,
        SignedInvoice       NVARCHAR(MAX) NULL,
        SignedQRCode        NVARCHAR(MAX) NULL,

        -- E-Way Bill
        EWayBillNo          VARCHAR(20)   NULL,
        EWayBillDate        DATETIME      NULL,
        EWayBillValidUpto   DATETIME      NULL,

        -- status + cancellation
        IRNStatus           VARCHAR(15)   NOT NULL CONSTRAINT DF_GST_EInvoice_IRNStatus DEFAULT ('ACTIVE'),
        CancelReason        VARCHAR(10)   NULL,
        CancelRemarks       NVARCHAR(200) NULL,
        CancelDate          DATETIME      NULL,
        EWBStatus           VARCHAR(15)   NULL,
        EWBCancelReason     VARCHAR(10)   NULL,
        EWBCancelRemarks    NVARCHAR(200) NULL,
        EWBCancelDate       DATETIME      NULL,

        -- audit / raw payloads
        RequestJSON         NVARCHAR(MAX) NULL,
        ResponseJSON        NVARCHAR(MAX) NULL,
        CreatedBy           VARCHAR(60)   NULL,
        CreatedDate         DATETIME      NOT NULL CONSTRAINT DF_GST_EInvoice_Created DEFAULT (GETDATE()),
        ModifiedDate        DATETIME      NULL
    );

    -- One IRN per document (per company + FY + sales type). Filtered so partial
    -- rows without a DocumentNo don't collide.
    CREATE UNIQUE INDEX UX_GST_EInvoice_Doc
        ON dbo.tbl_GST_EInvoice (CompanyCode, FYCode, SalesType, DocumentNo)
        WHERE DocumentNo IS NOT NULL;

    CREATE INDEX IX_GST_EInvoice_DocDate ON dbo.tbl_GST_EInvoice (CompanyCode, DocumentDate);
    CREATE INDEX IX_GST_EInvoice_IRN     ON dbo.tbl_GST_EInvoice (IRN);
END
GO
