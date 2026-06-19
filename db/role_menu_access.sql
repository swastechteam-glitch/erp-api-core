/* =====================================================================
   Role-based menu access — schema, seed, and super-admin bootstrap.

   Run ONCE per client database (the same DB your subDBName resolves to).
   Safe to re-run: every step is guarded / upserted.

   Tables:
     tbl_web_Role     - roles (GM, Manager, ...). IsSuperAdmin is set ONLY here.
     tbl_web_Menu     - catalog of access-controlled menus (seeded below).
     tbl_web_RoleMenu - which menus each role can access.
     tbl_web_UserRole - which role each user has (one role per user).
     tbl_web_UserMenu - menus assigned directly to a user (overrides role).

   Keys in tbl_web_Menu.MenuKey MUST match src/config/menuCatalog.js in the web app.
   ===================================================================== */

SET NOCOUNT ON;

/* -------------------------- tbl_web_Role ---------------------------- */
IF OBJECT_ID('dbo.tbl_web_Role', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tbl_web_Role (
    RoleCode     INT IDENTITY(1,1) PRIMARY KEY,
    RoleName     NVARCHAR(100) NOT NULL,
    IsSuperAdmin BIT          NOT NULL CONSTRAINT DF_webRole_IsSuperAdmin DEFAULT (0),
    Status       BIT          NOT NULL CONSTRAINT DF_webRole_Status       DEFAULT (1),
    CompanyCode  INT          NULL,
    CreatedBy    INT          NULL,
    CreatedOn    DATETIME     NOT NULL CONSTRAINT DF_webRole_CreatedOn    DEFAULT (GETDATE()),
    ModifiedBy   INT          NULL,
    ModifiedOn   DATETIME     NULL
  );
END
GO

/* -------------------------- tbl_web_Menu ---------------------------- */
IF OBJECT_ID('dbo.tbl_web_Menu', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tbl_web_Menu (
    MenuCode  INT IDENTITY(1,1) PRIMARY KEY,
    MenuKey   NVARCHAR(120) NOT NULL,
    MenuLabel NVARCHAR(200) NOT NULL,
    MenuType  NVARCHAR(20)  NOT NULL,   -- report | entry | approval
    GroupName NVARCHAR(120) NULL,
    SortOrder INT           NOT NULL CONSTRAINT DF_webMenu_SortOrder DEFAULT (0),
    Status    BIT           NOT NULL CONSTRAINT DF_webMenu_Status    DEFAULT (1),
    CONSTRAINT UQ_webMenu_MenuKey UNIQUE (MenuKey)
  );
END
GO

/* ------------------------ tbl_web_RoleMenu -------------------------- */
IF OBJECT_ID('dbo.tbl_web_RoleMenu', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tbl_web_RoleMenu (
    RoleMenuCode INT IDENTITY(1,1) PRIMARY KEY,
    RoleCode     INT NOT NULL,
    MenuCode     INT NOT NULL,
    CONSTRAINT UQ_webRoleMenu UNIQUE (RoleCode, MenuCode),
    CONSTRAINT FK_webRoleMenu_Role FOREIGN KEY (RoleCode) REFERENCES dbo.tbl_web_Role(RoleCode),
    CONSTRAINT FK_webRoleMenu_Menu FOREIGN KEY (MenuCode) REFERENCES dbo.tbl_web_Menu(MenuCode)
  );
END
GO

/* ------------------------ tbl_web_UserRole -------------------------- */
IF OBJECT_ID('dbo.tbl_web_UserRole', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tbl_web_UserRole (
    UserRoleCode INT IDENTITY(1,1) PRIMARY KEY,
    UserCode     INT NOT NULL,
    RoleCode     INT NOT NULL,
    CONSTRAINT UQ_webUserRole_User UNIQUE (UserCode),
    CONSTRAINT FK_webUserRole_Role FOREIGN KEY (RoleCode) REFERENCES dbo.tbl_web_Role(RoleCode)
  );
END
GO

/* ------------------------ tbl_web_UserMenu -------------------------- *
   Per-user menu assignment, set directly against the UserCode (no role
   lookup). When a user has rows here they OVERRIDE the role's menus in
   /role-access/my-menus; with no rows the user falls back to role menus. */
IF OBJECT_ID('dbo.tbl_web_UserMenu', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tbl_web_UserMenu (
    UserMenuCode INT IDENTITY(1,1) PRIMARY KEY,
    UserCode     INT NOT NULL,
    MenuCode     INT NOT NULL,
    CONSTRAINT UQ_webUserMenu UNIQUE (UserCode, MenuCode),
    CONSTRAINT FK_webUserMenu_Menu FOREIGN KEY (MenuCode) REFERENCES dbo.tbl_web_Menu(MenuCode)
  );
END
GO

/* --------------------- Seed / refresh tbl_web_Menu ----------------- *
   Upsert by MenuKey so labels/order stay current and re-runs are safe.
   KEEP IN SYNC with src/config/menuCatalog.js                          */
DECLARE @menu TABLE (MenuKey NVARCHAR(120), MenuLabel NVARCHAR(200), MenuType NVARCHAR(20), GroupName NVARCHAR(120), SortOrder INT);

INSERT INTO @menu (MenuKey, MenuLabel, MenuType, GroupName, SortOrder) VALUES
 ('CreatePurchase','Create Purchase','entry','Purchase Order Entry',1),
 ('PurchaseRecords','Purchase Records','entry','Purchase Order Entry',2),
 ('CreateSales','Create Sales','entry','Sales Order Entry',3),
 ('SalesRecords','Sales Records','entry','Sales Order Entry',4),
 ('PurchaseEntryApproval','Purchase Entry Approval','approval','Approvals',5),
 ('SalesEntryApproval','Sales Entry Approval','approval','Approvals',6),
 ('PurchaseOrder_DateWise','Purchase Order - Date Wise','report','Purchase',7),
 ('PurchaseOrder_ItemWise','Purchase Order - Item Wise','report','Purchase',8),
 ('PurchaseOrder_SuplireWise','Purchase Order - Supplier Wise','report','Purchase',9),
 ('PurchaseOrder_AgentWise','Purchase Order - Agent Wise','report','Purchase',10),
 ('PurchaseReturn_DateWise','Purchase Return - Date Wise','report','Purchase',11),
 ('PurchaseReturn_ItemWise','Purchase Return - Item Wise','report','Purchase',12),
 ('PurchaseReturn_SupplierWise','Purchase Return - Supplier Wise','report','Purchase',13),
 ('PurchaseReturn_AgentWise','Purchase Return - Agent Wise','report','Purchase',14),
 ('SalesOrder_DateWise','Sales Order - Date Wise','report','Sales',15),
 ('SalesOrder_ItemWise','Sales Order - Item Wise','report','Sales',16),
 ('SalesOrder_CustomerWise','Sales Order - Customer Wise','report','Sales',17),
 ('SalesOrder_AgentWise','Sales Order - Agent Wise','report','Sales',18),
 ('SalesOrderCancel_Report','Sales Order Cancel - Report','report','Sales',19),
 ('SalesOrderCancel_ItemWise','Sales Order Cancel - Item Wise','report','Sales',20),
 ('SalesOrderCancel_CustomerWise','Sales Order Cancel - Customer Wise','report','Sales',21),
 ('SalesOrderCancel_AgentWise','Sales Order Cancel - Agent Wise','report','Sales',22),
 ('InvoiceDetails_DateWise','Sales Details - Invoice Date Wise','report','Sales',23),
 ('InvoiceDetails_ItemWise','Sales Details - Invoice Item Wise','report','Sales',24),
 ('InvoiceDetails_CustomerWise','Sales Details - Invoice Customer Wise','report','Sales',25),
 ('InvoiceDetails_AgentWise','Sales Details - Invoice Agent Wise','report','Sales',26),
 ('SalesReturn_DateWise','Sales Return - Date Wise','report','Sales',27),
 ('SalesReturn_ItemWise','Sales Return - Item Wise','report','Sales',28),
 ('SalesReturn_CustomerWise','Sales Return - Customer Wise','report','Sales',29),
 ('SalesReturn_AgentWise','Sales Return - Agent Wise','report','Sales',30),
 ('InvoiceQC_OilReport1','InvoiceQC - Oil Report 1','report','Sales',31),
 ('InvoiceQC_OilReport2','InvoiceQC - Oil Report 2','report','Sales',32),
 ('SalesDebitCreditNote','Sales Debit & Credit Note','report','Sales',33),
 ('LorryFreight','Lorry Freight','report','Sales',34),
 ('ScrapSalesOrder_DateWise','Scrap Sales Order - Date Wise','report','Scraps Sales',35),
 ('ScrapSalesOrder_ItemWise','Scrap Sales Order - Item Wise','report','Scraps Sales',36),
 ('ScrapSalesOrder_CustomerWise','Scrap Sales Order - Customer Wise','report','Scraps Sales',37),
 ('ScrapSalesDetails_DateWise','Scrap Sales Details - Date Wise','report','Scraps Sales',38),
 ('ScrapSalesDetails_ItemWise','Scrap Sales Details - Item Wise','report','Scraps Sales',39),
 ('ScrapSalesDetails_CustomerWise','Scrap Sales Details - Customer Wise','report','Scraps Sales',40),
 ('ScrapSalesDetails_AgentWise','Scrap Sales Details - Agent Wise','report','Scraps Sales',41),
 ('ProcessControl_DateWise','Process Control - Date Wise','report','Factory MIS',42),
 ('ProcessControl_Monthly','Process Control - Monthly','report','Factory MIS',43),
 ('ProcessControl_Yearly','Process Control - Yearly','report','Factory MIS',44),
 ('LabAnalysis','Lab Analysis Report','report','Factory MIS',45),
 ('PelletizerOverall_DateWise','Pelletizer Over All Report','report','Factory MIS',46),
 ('KPI_DateWise','KPI - Date Wise','report','Factory MIS',47),
 ('KPI_MonthWise','KPI - Month Wise','report','Factory MIS',48),
 ('KPI_YearWise','KPI - Year Wise','report','Factory MIS',49),
 ('POHistory','MIS - PO History','report','Factory MIS',50),
 ('SalesInvoiceDetails','MIS - Sales Invoice Details','report','Factory MIS',51),
 ('GRNDetails_SupplierWise','MIS - GRN Details Supplier Wise','report','Factory MIS',52),
 ('UtilitiesBranProcessed_DateWise','Utilities vs Bran Processed - Date Wise','report','Factory MIS',53),
 ('UtilitiesBranProcessed_MonthWise','Utilities vs Bran Processed - Month Wise','report','Factory MIS',54),
 ('RawMaterialIssue_DateWise','Raw Material Issue - Date Wise','report','Production & Issue',55),
 ('RawMaterialIssue_ItemWise','Raw Material Issue - Item Wise','report','Production & Issue',56),
 ('RawMaterialIssue_GRNNoWise','Raw Material Issue - GRN No Wise','report','Production & Issue',57),
 ('ProductionIssue_DORPDateWiseAdmin','Production & Issue - DORP Date Wise (Admin)','report','Production & Issue',58),
 ('ProductionIssue_DORPDateWise','Production & Issue - DORP Date Wise','report','Production & Issue',59),
 ('ProductionIssue_OilDateWise','Production & Issue - Oil Date Wise','report','Production & Issue',60),
 ('FGStock_Oil','FG Stock - Oil','report','Production & Issue',61),
 ('FGStock_DORB','FG Stock - DORB','report','Production & Issue',62),
 ('ProductionBatch_IssueBatch','Production Batch - Issue Batch','report','Production & Issue',63),
 ('ProductionIssueDetails_DateWise','Production Issue Details - Date Wise','report','Production & Issue',64),
 ('ProductionIssueDetails_MonthWise','Production Issue Details - Month Wise','report','Production & Issue',65),
 ('ProductionIssueDetails_YearWise','Production Issue Details - Year Wise','report','Production & Issue',66),
 ('GRN_DateWise','GRN - Date Wise','report','Weighbridge',67),
 ('GRN_ItemWise','GRN - Item Wise','report','Weighbridge',68),
 ('GRN_SupplierWise','GRN - Supplier Wise','report','Weighbridge',69),
 ('GRN_PurchaseOrderWise','GRN - Purchase Order Wise','report','Weighbridge',70),
 ('GRNStock_Wise','GRN Stock - Grade Wise','report','Weighbridge',71),
 ('GRNStock_WithValue','GRN Stock - With Value','report','Weighbridge',72),
 ('GRNStock_WithValueDetails','GRN Stock - With Value Details','report','Weighbridge',73),
 ('WeighBridgeReport_DateWise','WeighBridge Report - Date Wise','report','Weighbridge',74),
 ('MaterialBalance_MonthWise','Material Balance - Month Wise','report','Reports',75),
 ('MaterialBalance_YearWise','Material Balance - Year Wise','report','Reports',76),
 ('MaterialBalance_DetailedMonthWise','Material Balance - Detailed Month Wise','report','Reports',77),
 ('MaterialBalance_DetailedYearWise','Material Balance - Detailed Year Wise','report','Reports',78),
 ('GunnyStock','Gunny Stock','report','Reports',79);

MERGE dbo.tbl_web_Menu AS t
USING @menu AS s ON t.MenuKey = s.MenuKey
WHEN MATCHED THEN
  UPDATE SET MenuLabel = s.MenuLabel, MenuType = s.MenuType,
             GroupName = s.GroupName, SortOrder = s.SortOrder, Status = 1
WHEN NOT MATCHED THEN
  INSERT (MenuKey, MenuLabel, MenuType, GroupName, SortOrder, Status)
  VALUES (s.MenuKey, s.MenuLabel, s.MenuType, s.GroupName, s.SortOrder, 1);
GO

/* --------------------- Bootstrap the Super Admin role -------------- *
   The ONLY place IsSuperAdmin is granted. The API never sets it.       */
IF NOT EXISTS (SELECT 1 FROM dbo.tbl_web_Role WHERE IsSuperAdmin = 1)
BEGIN
  INSERT INTO dbo.tbl_web_Role (RoleName, IsSuperAdmin, Status, CreatedOn)
  VALUES (N'Super Admin', 1, 1, GETDATE());
END
GO

/* --------------------- Assign yourself as Super Admin -------------- *
   EDIT @AdminUName below to your login username, then run this block.
   (UserCode is looked up from vw_User. Adjust the view/column if needed.)
*/
DECLARE @AdminUName NVARCHAR(100) = N'admin';   -- <<< CHANGE ME

DECLARE @AdminUserCode INT =
  (SELECT TOP 1 UserCode FROM dbo.vw_User WHERE UName = @AdminUName);

DECLARE @SuperRoleCode INT =
  (SELECT TOP 1 RoleCode FROM dbo.tbl_web_Role WHERE IsSuperAdmin = 1 ORDER BY RoleCode);

IF @AdminUserCode IS NOT NULL AND @SuperRoleCode IS NOT NULL
BEGIN
  MERGE dbo.tbl_web_UserRole AS t
  USING (SELECT @AdminUserCode AS UserCode) AS s ON t.UserCode = s.UserCode
  WHEN MATCHED THEN UPDATE SET RoleCode = @SuperRoleCode
  WHEN NOT MATCHED THEN INSERT (UserCode, RoleCode) VALUES (@AdminUserCode, @SuperRoleCode);

  PRINT 'Super Admin assigned to UserCode ' + CAST(@AdminUserCode AS NVARCHAR(20));
END
ELSE
  PRINT 'Could not find user "' + @AdminUName + '". Edit @AdminUName and re-run the bootstrap block.';
GO
