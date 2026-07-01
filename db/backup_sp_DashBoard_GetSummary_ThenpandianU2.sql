
 
CREATE PROCEDURE [dbo].[sp_DashBoard_GetSummary]
@CompanyCode AS Integer =  1
AS
DECLARE @FromDate Datetime
DECLARE @ToDate DateTime


SET @FromDate = CAST(CONVERT(CHAR(6), GETDATE(), 112) + '01' AS DATE)
SET @ToDate = CAST(GETDATE()AS DATE)


DECLARE @FromDate_PrevMonth Datetime
DECLARE @ToDate_PrevMonth DateTime

DECLARE @YesterDay DateTime

SET @YesterDay = DATEADD(DAY, -1,@ToDate) 
  
SET @FromDate_PrevMonth = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) - 1, 0);
SET @ToDate_PrevMonth = DATEADD(DAY, -1, DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0));
  

DECLARE @StoreSpareStock AS TABLE (Amount INT)


INSERT INTO @StoreSpareStock 
select CurStockValue  from tbl_Item  where DepartmentCode NOT IN 
(Select DepartmentCode from tbl_Department where DepartmentName 
Like  '%PACKING%' )
OPTION(RECOMPILE);

DECLARE @StorePackingStock AS TABLE (Amount INT)
INSERT INTO @StorePackingStock 
select CurStockValue  from tbl_Item  where DepartmentCode  IN 
(Select DepartmentCode from tbl_Department where DepartmentName 
Like  '%PACKING%' )
OPTION(RECOMPILE);
 
	DECLARE @CottonPurchaseOrder AS TABLE (CompanyCode int,CPODate DateTime,Qty int)
	INSERT INTO @CottonPurchaseOrder
	SELECT CompanyCode,CPODate,Qty from vw_CottonPurchaseOrder 
	WHERE CPODate >= @FromDate_PrevMonth AND CPODate <= @ToDate 
	
	DECLARE @CottonArrival AS TABLE(CompanyCode int,ArrivalDate DateTime,Qty int,NetAmount numeric(12,2))
	
	INSERT INTO @CottonArrival 
	SELECT CompanyCode,ArrivalDate,Qty,NetAmount  FROM tbl_CottonArrival 
	WHERE ArrivalDate >= @FromDate_PrevMonth AND ArrivalDate <= @ToDate 
	
	  
	DECLARE @CottonIssue AS TABLE(CompanyCode int,ArrivalCode int,CottonIssueDate Datetime,CurrentWt numeric(12,3),Allowance numeric(12,3),TareWeight numeric(12,3), SampleWeight numeric(12,3),ActGrossValue numeric(12,3))
	INSERT INTO @CottonIssue 
	SELECT CompanyCode,ArrivalCode,CottonIssueDate,CurrentWt,Allowance,TareWeight,SampleWeight,ActGrossValue  
	from vw_CottonIssueDetails 
	WHERE CottonIssueDate >= @FromDate_PrevMonth AND CottonIssueDate <= @ToDate 
	
	DECLARE @CottonSales AS  TABLE(CompanyCode int,CottonSalesDate DateTime,GrossAmount numeric(12,2))
	INSERT INTO @CottonSales 
	SELECT CompanyCode,CottonSalesDate,GrossAmount FROM vw_CottonSalesDetails 
	WHERE CottonSalesDate >= @FromDate_PrevMonth AND CottonSalesDate <= @ToDate 
	
	DECLARE @YarnProdn AS TABLE(CompanyCode int,ProductionDate DateTime,BagNo int,NetWeight numeric(12,3))
	INSERT INTO @YarnProdn 
	SELECT CompanyCode,ProductionDate,BagNo,NetWeight FROM tbl_YarnStock 
	WHERE ProductionDate >= @FromDate_PrevMonth AND ProductionDate <= @ToDate 
	
	DECLARE @YarnSalesOrder AS TABLE(CompanyCode int,SODate DateTime,Qty int,Weight numeric(12,3))
	INSERT INTO @YarnSalesOrder 
	SELECT CompanyCode,SODate,Qty,Weight  FROM vw_SalesOrderDetails 
	WHERE SODate >= @FromDate_PrevMonth AND SODate <= @ToDate 
	
	DECLARE @YarnInvoice AS TABLE(CompanyCode int,InvoiceDate DateTime,Qty int,Weight numeric(12,3),BasicAmount numeric(12,2))
	INSERT INTO @YarnInvoice 
	SELECT CompanyCode,InvoiceDate,Qty,Weight,BasicAmount From vw_InvoiceDetails 
	WHERE InvoiceDate >= @FromDate_PrevMonth AND InvoiceDate <= @ToDate 
	
	DECLARE @WasteProdn AS TABLE (CompanyCode int,WasteProductionDate DateTime, BaleNo int,NetWeight numeric(12,3))
	INSERT INTO @WasteProdn 
	SELECT CompanyCode,WasteProductionDate,BaleNo,NetWeight FROM tbl_WasteStock 
	WHERE WasteProductionDate >= @FromDate_PrevMonth AND WasteProductionDate <= @ToDate 
	
	DECLARE @WasteInvoice AS TABLE (CompanyCode int,WasteInvoiceDate DateTime,Qty int,SalesWeight numeric(12,3),Amount numeric(12,2))
	INSERT INTO @WasteInvoice 
	SELECT CompanyCode,WasteInvoiceDate,Qty,SalesWeight,Amount FROM vw_WasteInvoiceDetails 
	WHERE WasteInvoiceDate >= @FromDate_PrevMonth AND WasteInvoiceDate <= @ToDate
	
	DECLARE @GeneralSales AS TABLE(CompanyCode int,GeneralSalesDate DateTime,Amount numeric(12,2))
	INSERT INTO @GeneralSales 
	SELECT CompanyCode,GeneralSalesDate,Amount  FROM vw_GeneralSalesDetails
	WHERE GeneralSalesDate >= @FromDate_PrevMonth AND GeneralSalesDate <= @ToDate
	
	DECLARE @ScrapInvoice AS TABLE(CompanyCode int,ScrapInvoiceDate DateTime,GrossAmount numeric(12,2)) 
	INSERT INTO @ScrapInvoice 
	SELECT CompanyCode,ScrapInvoiceDate,GrossAmount  FROM vw_ScrapInvoiceDetails
	WHERE ScrapInvoiceDate >= @FromDate_PrevMonth AND ScrapInvoiceDate <= @ToDate
	
	DECLARE @PurchaseOrderReceived AS  TABLE(CompanyCode int,PurchaseOrderReceivedDate DateTime,Amount numeric(12,2))
	INSERT INTO @PurchaseOrderReceived 
	SELECT CompanyCode,PurchaseOrderReceivedDate,Amount from vw_PurchaseOrderReceivedDetails 
	WHERE PurchaseOrderReceivedDate >= @FromDate_PrevMonth AND PurchaseOrderReceivedDate <= @ToDate
	
	DECLARE @SpgProdn AS TABLE(CompanyCode int,SpgProdnDate DateTime,ShiftCode int,Prodn numeric(12,3),ProdnEffi numeric(12,2),Utilisation numeric(12,2),[40s_ConversionValue]  numeric(12,2),WastePer numeric(12,2))
	INSERT INTO @SpgProdn 
	SELECT CompanyCode,SpgProdnDate,ShiftCode,Prodn,ProdnEffi,Utilisation,[40s_ConversionValue],WastePer FROM vw_Prodn_SpinningProdnDetails
	WHERE SpgProdnDate >= @FromDate_PrevMonth AND SpgProdnDate <= @ToDate
	
	DECLARE @ACProdn AS TABLE(CompanyCode int,ACProdnDate DateTime,ShiftCode int,ProdnKgs numeric(12,3),ProdnEffi numeric(12,2),Utilisation numeric(12,2), WastePer numeric(12,2))
	INSERT INTO @ACProdn 
	SELECT CompanyCode,ACProdnDate,ShiftCode,ProdnKgs,ProdnEffi,Utilisation,WastePer FROM vw_Prodn_AutoConerProdnDetails
	WHERE ACProdnDate >= @FromDate_PrevMonth AND ACProdnDate <= @ToDate
	
	DECLARE @Maintenance AS TABLE(CompanyCode int, DepartmentCode int,Servicetype char(1),LastMaintenanceDate DateTime,NextServiceDate DateTime,DurationDays int)
	INSERT INTO @Maintenance 
	SELECT CompanyCode,DepartmentCode,Servicetype,LastMaintenanceDate,NextServiceDate,DurationDays FROM vw_MachineDetails_ServiceSchedule
	
	DECLARE @Strength AS TABLE( StDate DateTime,GeneralShift NUMERIC(10,1) DEFAULT(0),IShift NUMERIC(10,1) DEFAULT(0),IIShift NUMERIC(10,1) DEFAULT(0),IIIShift NUMERIC(10,1) DEFAULT(0),GeneralShift_OT NUMERIC(10,1) DEFAULT(0),IShift_OT NUMERIC(10,1) DEFAULT(0),IIShift_OT NUMERIC(10,1) DEFAULT(0),IIIShift_OT NUMERIC(10,1) DEFAULT(0),ShiftSalary numeric(12,2) DEFAULT(0),OTSalary numeric(12,2) DEFAULT(0))
	INSERT INTO @Strength 
	SELECT StDate,GeneralShift, IShift,IIShift,IIIShift,GeneralShift_OT,IShift_OT,IIShift_OT,IIIShift_OT,ShiftSalary,OTSalary FROM tbl_Strength 
	
	
	DECLARE @Atten AS  TABLE (CompanyCode int,CalendarDate DateTime,EmployeeCode int,Late_In varchar(8),Early_Out varchar(8))
	INSERT INTO @Atten 
	SELECT CompanyCode,CalendarDate,EmployeeCode,Late_In,Early_Out from tbl_Employee_Attendance 
	WHERE CalendarDate >= @FromDate_PrevMonth AND CalendarDate <= @ToDate
	
	
 SELECT (
--COTTON====================================================================
	 SELECT  CAST(ISNULL(SUM(Qty),0) AS INT)  from @CottonPurchaseOrder where CPODate  = @YesterDay AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS CottonPOQty_YesterDay,
	(SELECT  CAST(ISNULL(SUM(Qty),0) AS INT)  from @CottonPurchaseOrder where CPODate  = @ToDate AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS CottonPOQty_ToDay,
	(SELECT  CAST(ISNULL(SUM(Qty),0) AS INT)  from @CottonPurchaseOrder where CPODate >= @FromDate AND CPODate <= @ToDate AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonPOQty_UptoDate ,

	
	 
	(SELECT  CAST(ISNULL(SUM(Qty),0) AS INT)  from @CottonArrival where ArrivalDate  = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS CottonGRNQty_YesterDay,
	(SELECT  CAST(ISNULL(SUM(Qty),0) AS INT)  from @CottonArrival where ArrivalDate  = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS CottonGRNQty_ToDay,
	(SELECT  CAST(ISNULL(SUM(Qty),0) AS INT)  from @CottonArrival where ArrivalDate >= @FromDate AND ArrivalDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonGRNQty_UptoDate, 
	
	(SELECT  CAST(ISNULL(SUM(NetAmount),0) AS INT)  from @CottonArrival where ArrivalDate  = @YesterDay   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonGRNAmount_YesterDay,
	(SELECT  CAST(ISNULL(SUM(NetAmount),0) AS INT)  from @CottonArrival where ArrivalDate  = @ToDate   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonGRNAmount_ToDay,
	(SELECT  CAST(ISNULL(SUM(NetAmount),0) AS INT)  from @CottonArrival where ArrivalDate >= @FromDate AND ArrivalDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonGRNAmount_UptoDate, 
	
	
	(SELECT  CAST(ISNULL(SUM(NetAmount),0) AS INT)  from @CottonArrival where ArrivalDate >= @FromDate_PrevMonth  AND ArrivalDate <= @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonGRNAmount_PrevMonth, 
	
	
	
	(SELECT CAST(ISNULL(COUNT(ArrivalCode),0) AS INT)  from @CottonIssue  WHERE CottonIssueDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonIssueBales_YesterDay,
	(SELECT CAST(ISNULL(COUNT(ArrivalCode),0) AS INT)  from @CottonIssue  WHERE CottonIssueDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonIssueBales_ToDate,
	(SELECT CAST(ISNULL(COUNT(ArrivalCode),0) AS INT)  from @CottonIssue  WHERE CottonIssueDate >= @FromDate AND CottonIssueDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonIssueBales_UptoDate,  

	(SELECT CAST(ISNULL(SUM(ActGrossValue),0) AS INT)  from @CottonIssue  WHERE CottonIssueDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonIssueAmount_YesterDay,
	(SELECT CAST(ISNULL(SUM(ActGrossValue),0) AS INT)  from @CottonIssue  WHERE CottonIssueDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonIssueAmount_ToDate,
	(SELECT CAST(ISNULL(SUM(ActGrossValue),0) AS INT)  from @CottonIssue  WHERE CottonIssueDate >= @FromDate AND CottonIssueDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonIssueAmount_UptoDate , 
	
	(SELECT CAST(ISNULL(SUM(CurrentWt) - (SUM(Allowance) + SUM(TareWeight) + SUM(SampleWeight)),0) AS INT)  from @CottonIssue  WHERE CottonIssueDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonIssueKgs_YesterDay,
	(SELECT CAST(ISNULL(SUM(CurrentWt) - (SUM(Allowance) + SUM(TareWeight) + SUM(SampleWeight)),0) AS INT)  from @CottonIssue  WHERE CottonIssueDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonIssueKgs_ToDate,
	(SELECT CAST(ISNULL(SUM(CurrentWt) - (SUM(Allowance) + SUM(TareWeight) + SUM(SampleWeight)),0) AS INT)  from @CottonIssue  WHERE CottonIssueDate >= @FromDate AND CottonIssueDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonIssueKgs_UptoDate , 
 
	
	(SELECT CAST(ISNULL(SUM(ClosingBales),0) AS INT)  from tbl_Cotton_Stock Where CompanyCode = ISNULL(@CompanyCode,CompanyCode)  ) AS CottonClBales,
	(SELECT CAST(ISNULL(SUM(ClosingKgs),0) AS INT)  from tbl_Cotton_Stock Where CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonClKgs,  
	
 
	(SELECT  CAST(ISNULL(SUM(GrossAmount),0) AS INT)  from @CottonSales where CottonSalesDate   = @YesterDay   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonSalesAmount_YesterDay ,
	(SELECT  CAST(ISNULL(SUM(GrossAmount),0) AS INT)  from @CottonSales where CottonSalesDate   = @ToDate   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonSalesAmount_ToDay,
	(SELECT  CAST(ISNULL(SUM(GrossAmount),0) AS INT)  from @CottonSales where CottonSalesDate >= @FromDate AND CottonSalesDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonSalesAmount_UptoDate,
	
	(SELECT  CAST(ISNULL(SUM(GrossAmount),0) AS INT)  from @CottonSales where CottonSalesDate >= @FromDate_PrevMonth AND CottonSalesDate <= @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS CottonSalesAmount_PrevMonth,  

------YARN=============================================================================================
	(SELECT CAST(ISNULL(COUNT(BagNo),0) AS INT) from @YarnProdn WHERE ProductionDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnProdnBags_YesterDay, 
	(SELECT CAST(ISNULL(COUNT(BagNo),0) AS INT) from @YarnProdn WHERE ProductionDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnProdnBags_ToDay, 
	(SELECT CAST(ISNULL(COUNT(BagNo),0) AS INT) from @YarnProdn WHERE ProductionDate >=  @FromDate AND ProductionDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnProdnBags_UpToDate ,  

	(SELECT CAST(ISNULL(SUM(NetWeight),0) AS INT) from @YarnProdn WHERE ProductionDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnProdnKgs_YesterDay, 
	(SELECT CAST(ISNULL(SUM(NetWeight),0) AS INT) from @YarnProdn WHERE ProductionDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnProdnKgs_ToDay, 
	(SELECT CAST(ISNULL(SUM(NetWeight),0) AS INT) from @YarnProdn WHERE ProductionDate >= @FromDate AND ProductionDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnProdnKgs_UptoDate, 

     (SELECT CAST(ISNULL(SUM (NetWeight),0) AS INT) from vw_YarnStock WHERE ProductionDate >= @FromDate_PrevMonth AND ProductionDate <= @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnProdnKgs_PrevMonth,

	--(SELECT CAST(ISNULL(COUNT (BagNo),0) AS INT) from vw_YarnStock  WHERE ProductionDate = @YesterDay   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS YarnPackedBags_YesterDay ,
	--(SELECT CAST(ISNULL(COUNT (BagNo),0) AS INT) from vw_YarnStock  WHERE ProductionDate = @ToDate   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS YarnPackedBags_ToDay ,

	--(SELECT CAST(ISNULL(COUNT (BagNo),0) AS INT) from vw_YarnStock WHERE ProductionDate >= @FromDate AND ProductionDate <= @ToDate   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnPackedBags_UpToDate,

	--(SELECT CAST(ISNULL(SUM (NetWeight),0) AS INT) from vw_YarnStock  WHERE ProductionDate = @YesterDay   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS YarnPackedKgs_YesterDay ,
	--(SELECT CAST(ISNULL(SUM (NetWeight),0) AS INT) from vw_YarnStock  WHERE ProductionDate = @ToDate   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS YarnPackedKgs_ToDay ,

	--(SELECT CAST(ISNULL(SUM (NetWeight),0) AS INT) from vw_YarnStock WHERE ProductionDate >= @FromDate AND ProductionDate <= @ToDate   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnPackedKgs_UpToDate,

	


	(SELECT CAST(ISNULL(SUM(Qty),0) AS INT) from @YarnSalesOrder WHERE SODate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSOBags_YesterDay , 
	(SELECT CAST(ISNULL(SUM(Qty),0) AS INT) from @YarnSalesOrder WHERE SODate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSOBags_ToDay , 
	(SELECT CAST(ISNULL(SUM(Qty),0) AS INT)  from @YarnSalesOrder WHERE SODate >= @FromDate AND SODate <=  @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSOBags_UpToDate,  

	(SELECT CAST(ISNULL(SUM(Weight),0) AS INT) from @YarnSalesOrder WHERE SODate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSOKgs_YesterDay, 
	(SELECT CAST(ISNULL(SUM(Weight),0) AS INT) from @YarnSalesOrder WHERE SODate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSOKgs_ToDay , 
	(SELECT CAST(ISNULL(SUM(Weight),0) AS INT)  from @YarnSalesOrder WHERE SODate >= @FromDate AND SODate <=  @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSOKgs_UpToDate ,

	(SELECT CAST(ISNULL(SUM(Qty),0) AS INT) from @YarnInvoice WHERE InvoiceDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSalesBags_YesterDay , 
	(SELECT CAST(ISNULL(SUM(Qty),0) AS INT) from @YarnInvoice WHERE InvoiceDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSalesBags_ToDay , 
	(SELECT CAST(ISNULL(SUM(Qty),0) AS INT) from @YarnInvoice WHERE InvoiceDate >= @FromDate AND InvoiceDate <=  @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSalesBags_UpToDate,  

	(SELECT CAST(ISNULL(SUM(Weight),0) AS INT) from @YarnInvoice WHERE InvoiceDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSalesKgs_YesterDay ,
	(SELECT CAST(ISNULL(SUM(Weight),0) AS INT) from @YarnInvoice WHERE InvoiceDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSalesKgs_ToDay , 
	(SELECT CAST(ISNULL(SUM(Weight),0) AS INT)  from @YarnInvoice WHERE InvoiceDate >= @FromDate AND InvoiceDate <=  @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSalesKgs_UpToDate, 
	
	(SELECT CAST(ISNULL(SUM(BasicAmount),0) AS INT) from @YarnInvoice WHERE InvoiceDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSalesAmount_YesterDay , 
	(SELECT CAST(ISNULL(SUM(BasicAmount),0) AS INT) from @YarnInvoice WHERE InvoiceDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSalesAmount_ToDay , 
	(SELECT CAST(ISNULL(SUM(BasicAmount),0) AS INT) from @YarnInvoice WHERE InvoiceDate >= @FromDate AND InvoiceDate <=  @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSalesAmount_UpToDate,  

	(SELECT CAST(ISNULL(SUM(BasicAmount),0) AS INT) from @YarnInvoice WHERE InvoiceDate >= @FromDate_PrevMonth AND InvoiceDate <=  @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS YarnSalesAmount_PrevMonth ,  
	
	 (SELECT CAST(ISNULL( SUM(Bags),0) AS INT) from tbl_Web_YarnStock   ) AS YarnStock_Bags , 
	(SELECT CAST(ISNULL(SUM (Kgs),0) AS INT)  from tbl_Web_YarnStock  ) AS YarnStock_Kgs ,  

----WASTE=============================================================================================
	
	(SELECT CAST(ISNULL(COUNT(BaleNo),0) AS INT) from @WasteProdn WHERE WasteProductionDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteProdnBale_YesterDay, 
	(SELECT CAST(ISNULL(COUNT(BaleNo),0) AS INT) from @WasteProdn WHERE WasteProductionDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteProdnBale_ToDay, 
	(SELECT CAST(ISNULL(COUNT(BaleNo),0) AS INT) from @WasteProdn WHERE WasteProductionDate >=  @FromDate AND WasteProductionDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteProdnBale_UpToDate,  

	(SELECT CAST(ISNULL(SUM(NetWeight),0) AS INT) from @WasteProdn WHERE WasteProductionDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteProdnKgs_YesterDay, 
	(SELECT CAST(ISNULL(SUM(NetWeight),0) AS INT) from @WasteProdn WHERE WasteProductionDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteProdnKgs_ToDay, 
	(SELECT CAST(ISNULL(SUM(NetWeight),0) AS INT) from @WasteProdn WHERE WasteProductionDate >= @FromDate AND WasteProductionDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteProdnKgs_UptoDate, 

	(SELECT CAST(ISNULL(SUM(NetWeight),0) AS INT) from @WasteProdn WHERE WasteProductionDate >= @FromDate_PrevMonth AND WasteProductionDate <= @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteProdnKgs_PrevMonth,  
	
	(SELECT CAST(ISNULL(SUM(Qty),0) AS INT) from @WasteInvoice WHERE WasteInvoiceDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteSalesBales_YesterDay , 
	(SELECT CAST(ISNULL(SUM(Qty),0) AS INT) from @WasteInvoice WHERE WasteInvoiceDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteSalesBales_ToDay , 
	(SELECT CAST(ISNULL(SUM(Qty),0) AS INT) from @WasteInvoice WHERE WasteInvoiceDate >= @FromDate AND WasteInvoiceDate <=  @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteSalesBales_UpToDate,   

	(SELECT CAST(ISNULL(SUM(SalesWeight),0) AS INT) from @WasteInvoice WHERE WasteInvoiceDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteSalesKgs_YesterDay , 
	(SELECT CAST(ISNULL(SUM(SalesWeight),0) AS INT) from @WasteInvoice WHERE WasteInvoiceDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteSalesKgs_ToDay , 
	(SELECT CAST(ISNULL(SUM(SalesWeight),0) AS INT)  from @WasteInvoice WHERE WasteInvoiceDate >= @FromDate AND WasteInvoiceDate <=  @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteSalesKgs_UpToDate,   
	
	(SELECT CAST(ISNULL(SUM(Amount),0) AS INT) from @WasteInvoice WHERE WasteInvoiceDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteSalesAmount_YesterDay , 	
	(SELECT CAST(ISNULL(SUM(Amount),0) AS INT) from @WasteInvoice WHERE WasteInvoiceDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteSalesAmount_ToDay , 
	(SELECT CAST(ISNULL(SUM(Amount),0) AS INT)  from @WasteInvoice WHERE WasteInvoiceDate >= @FromDate AND WasteInvoiceDate <=  @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteSalesAmount_UpToDate,    

	(SELECT CAST(ISNULL(SUM(Amount),0) AS INT)  from @WasteInvoice WHERE WasteInvoiceDate >= @FromDate_PrevMonth AND WasteInvoiceDate <=  @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS WasteSalesAmount_PrevMonth ,
	
	(SELECT CAST(ISNULL(SUM (Bales),0) AS INT) from tbl_Web_WasteStock  ) AS WasteStock_Bales ,  
	(SELECT CAST( ISNULL(SUM(Kgs),0) AS INT)  from tbl_Web_WasteStock  ) AS WasteStock_Kgs  ,

--GENERAL SALES====================================================================================
	(SELECT CAST(ISNULL(SUM(Amount),0) AS INT) from @GeneralSales WHERE GeneralSalesDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS GeneralSalesAmount_YesterDay , 
	(SELECT CAST(ISNULL(SUM(Amount),0) AS INT) from @GeneralSales WHERE GeneralSalesDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS GeneralSalesAmount_ToDay , 
	(SELECT CAST(ISNULL(SUM(Amount),0) AS INT)  from @GeneralSales WHERE GeneralSalesDate >= @FromDate AND GeneralSalesDate <=  @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS GeneralSalesAmount_UpToDate,
	
	(SELECT CAST(ISNULL(SUM(Amount),0) AS INT)  from @GeneralSales WHERE GeneralSalesDate >= @FromDate_PrevMonth AND GeneralSalesDate <=  @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS GeneralSalesAmount_PrevMonth ,

----SCRAP SALES====================================================================================	
	(SELECT CAST(ISNULL(SUM(GrossAmount),0) AS INT) from @ScrapInvoice WHERE ScrapInvoiceDate  = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ScrapSalesAmount_YesterDay , 
	(SELECT CAST(ISNULL(SUM(GrossAmount),0) AS INT) from @ScrapInvoice WHERE ScrapInvoiceDate  = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ScrapSalesAmount_ToDay , 
	(SELECT CAST(ISNULL(SUM(GrossAmount),0) AS INT)  from @ScrapInvoice WHERE ScrapInvoiceDate >= @FromDate AND ScrapInvoiceDate <=  @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ScrapSalesAmount_UpToDate,
	
	
	  
	(SELECT CAST(ISNULL(SUM(GrossAmount),0) AS INT)  from @ScrapInvoice WHERE ScrapInvoiceDate >= @FromDate_PrevMonth AND ScrapInvoiceDate <=  @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ScrapSalesAmount_PrevMonth ,
	
----STORES===========================================================================================

	(SELECT  CAST(ISNULL(SUM (Amount),0) AS INT) from @PurchaseOrderReceived WHERE PurchaseOrderReceivedDate = @YesterDay AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS StoreGRNAmount_YesterDay , 
	(SELECT  CAST(ISNULL(SUM (Amount),0) AS INT) from @PurchaseOrderReceived WHERE PurchaseOrderReceivedDate = @ToDate AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS StoreGRNAmount_ToDay , 
	(SELECT  CAST(ISNULL(SUM (Amount),0) AS INT) from @PurchaseOrderReceived WHERE PurchaseOrderReceivedDate >= @FromDate AND PurchaseOrderReceivedDate<= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS StoreGRNAmount_UpToDate,


	(SELECT  CAST(ISNULL(SUM (Amount),0) AS INT) from @PurchaseOrderReceived WHERE PurchaseOrderReceivedDate >= @FromDate_PrevMonth AND PurchaseOrderReceivedDate<= @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS StoreGRNAmount_PreMonth,
	
	(SELECT  CAST(ISNULL(SUM (Amount),0) AS INT) from vw_IssueDetails  WHERE IssueDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS StoreIssueAmount_YesterDay , 
	(SELECT  CAST(ISNULL(SUM (Amount),0) AS INT) from vw_IssueDetails  WHERE IssueDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS StoreIssueAmount_ToDay , 
	(SELECT  CAST(ISNULL(SUM (Amount),0) AS INT) from vw_IssueDetails WHERE IssueDate >= @FromDate AND IssueDate<= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS StoreIssueAmount_UpToDate, 
	
	(SELECT CAST(ISNULL(SUM (Amount),0) AS INT) from @StoreSpareStock  ) AS StoreStock_Spares , 
	(SELECT CAST( ISNULL(SUM(Amount),0) AS INT)  from @StorePackingStock  ) AS StoreStock_Packing,  
	
	
----PRODUCTION - SPINNING ===========================================================================================	
	(SELECT CAST(ISNULL(SUM (Prodn),0) AS INT) from @SpgProdn WHERE SpgProdnDate = @YesterDay    AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS SpgProdn_YesterDay,
	(SELECT CAST(ISNULL(SUM (Prodn),0) AS INT) from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 2  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgProdn_ToDay_DayShift ,
	(SELECT CAST(ISNULL(SUM (Prodn),0) AS INT) from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgProdn_ToDay_HalfNightShift, 
	(SELECT CAST(ISNULL(SUM (Prodn),0) AS INT) from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 4   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS SpgProdn_ToDay_NightShift,

	(SELECT CAST(ISNULL(SUM (Prodn),0) AS INT) from @SpgProdn WHERE SpgProdnDate = @ToDate    AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS SpgProdn_ToDay ,

	(SELECT CAST(ISNULL(SUM (Prodn),0) AS INT) from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 2   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS SpgProdn_UpToDate_DayShift ,
	(SELECT CAST(ISNULL(SUM (Prodn),0) AS INT) from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgProdn_UpToDate_HalfNightShift, 
	(SELECT CAST(ISNULL(SUM (Prodn),0) AS INT) from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 4  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgProdn_UpToDate_NightShift, 

	(SELECT CAST(ISNULL(SUM (Prodn),0) AS INT) from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgProdn_UpToDate,

	(SELECT CAST(ISNULL(SUM (Prodn),0) AS INT) from @SpgProdn WHERE SpgProdnDate >= @FromDate_PrevMonth AND SpgProdnDate <= @ToDate_PrevMonth   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgProdn_PrevMonth,

	(SELECT  CAST(ISNULL(AVG (ProdnEffi),0)AS NUMERIC(12,2))    from @SpgProdn WHERE ProdnEffi > 0 AND SpgProdnDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgEff_YesterDay ,

	(SELECT  CAST(ISNULL(AVG (ProdnEffi),0) AS NUMERIC(12,2))    from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 2   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS SpgEff_ToDay_DayShift ,
	(SELECT  CAST(ISNULL(AVG (ProdnEffi),0)AS NUMERIC(12,2))    from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgEff_ToDay_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG (ProdnEffi),0)AS NUMERIC(12,2))    from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 4  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgEff_ToDay_NightShift,

	(SELECT  CAST(ISNULL(AVG (ProdnEffi),0)AS NUMERIC(12,2))    from @SpgProdn WHERE ProdnEffi > 0 AND SpgProdnDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgEff_ToDay ,

	(SELECT  CAST(ISNULL(AVG (ProdnEffi),0)AS NUMERIC(12,2))     from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 2  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgEff_UpToDate_DayShift ,
	(SELECT  CAST(ISNULL(AVG(ProdnEffi),0) AS NUMERIC(12,2))    from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgEff_UpToDate_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG(ProdnEffi),0)AS NUMERIC(12,2))   from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 4   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS SpgEff_UpToDate_NightShift ,

	(SELECT  CAST(ISNULL(AVG(ProdnEffi),0)AS NUMERIC(12,2))   from @SpgProdn WHERE ProdnEffi > 0 AND  SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS SpgEff_UpToDate,

	(SELECT  CAST(ISNULL(AVG(ProdnEffi),0)AS NUMERIC(12,2))   from @SpgProdn WHERE ProdnEffi > 0 AND  SpgProdnDate >= @FromDate_PrevMonth AND SpgProdnDate <= @FromDate_PrevMonth   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS SpgEff_PrevMonth,

	(SELECT  CAST(ISNULL(AVG (Utilisation),0)AS NUMERIC(12,2))  from @SpgProdn WHERE Utilisation > 0 AND SpgProdnDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgUtil_YesterDay,
	(SELECT  CAST(ISNULL(AVG (Utilisation),0) AS NUMERIC(12,2)) from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 2  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgUtil_ToDay_DayShift ,
	(SELECT  CAST(ISNULL(AVG (Utilisation),0)AS NUMERIC(12,2))  from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgUtil_ToDay_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG (Utilisation),0)AS NUMERIC(12,2))  from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 4  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgUtil_ToDay_NightShift,

	(SELECT  CAST(ISNULL(AVG (Utilisation),0)AS NUMERIC(12,2)) from @SpgProdn WHERE Utilisation > 0 AND SpgProdnDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgUtil_ToDay,

	(SELECT  CAST(ISNULL(AVG (Utilisation),0)AS NUMERIC(12,2)) from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 2   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS SpgUtil_UpToDate_DayShift ,
	(SELECT  CAST(ISNULL(AVG(Utilisation),0) AS NUMERIC(12,2)) from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgUtil_UpToDate_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG(Utilisation),0)AS NUMERIC(12,2))  from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 4  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgUtil_UpToDate_NightShift ,

	(SELECT  CAST(ISNULL(AVG(Utilisation),0)AS NUMERIC(12,2)) from @SpgProdn WHERE Utilisation > 0 AND  SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgUtil_UpToDate ,

	(SELECT  CAST(ISNULL(AVG(Utilisation),0)AS NUMERIC(12,2)) from @SpgProdn WHERE Utilisation > 0 AND  SpgProdnDate >= @FromDate_PrevMonth AND SpgProdnDate <= @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgUtil_PrevMonth ,

	(SELECT  CAST(ISNULL(AVG ([40s_ConversionValue]),0)AS NUMERIC(12,2))  from @SpgProdn WHERE [40s_ConversionValue] > 0 AND SpgProdnDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS Spg40s_YesterDay,
	(SELECT  CAST(ISNULL(AVG ([40s_ConversionValue]),0) AS NUMERIC(12,2)) from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 2   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS Spg40s_ToDay_DayShift ,
	(SELECT  CAST(ISNULL(AVG ([40s_ConversionValue]),0)AS NUMERIC(12,2))  from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS Spg40s_ToDay_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG ([40s_ConversionValue]),0)AS NUMERIC(12,2))  from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 4  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS Spg40s_ToDay_NightShift,

	(SELECT  CAST(ISNULL(AVG ([40s_ConversionValue]),0)AS NUMERIC(12,2))  from @SpgProdn WHERE [40s_ConversionValue] > 0 AND SpgProdnDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS Spg40s_ToDay ,



	(SELECT  CAST(ISNULL(AVG ([40s_ConversionValue]),0)AS NUMERIC(12,2))  from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 2   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS Spg40s_UpToDate_DayShift ,
	(SELECT  CAST(ISNULL(AVG([40s_ConversionValue]),0) AS NUMERIC(12,2))  from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS Spg40s_UpToDate_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG([40s_ConversionValue]),0)AS NUMERIC(12,2))   from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 4  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS Spg40s_UpToDate_NightShift,

	(SELECT  CAST(ISNULL(AVG([40s_ConversionValue]),0)AS NUMERIC(12,2))   from @SpgProdn WHERE [40s_ConversionValue] > 0 AND  SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND   CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS Spg40s_UpToDate,

	(SELECT  CAST(ISNULL(AVG([40s_ConversionValue]),0)AS NUMERIC(12,2))   from @SpgProdn WHERE [40s_ConversionValue] > 0 AND  SpgProdnDate >= @FromDate_PrevMonth AND SpgProdnDate <= @ToDate_PrevMonth AND   CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS Spg40s_PrevMonth,

	(SELECT  CAST(ISNULL(AVG (WastePer),0)AS NUMERIC(12,2))  from @SpgProdn WHERE WastePer > 0 AND SpgProdnDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgWastePer_YesterDay ,
	(SELECT  CAST(ISNULL(AVG (WastePer),0) AS NUMERIC(12,2)) from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 2  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgWastePer_ToDay_DayShift ,
	(SELECT  CAST(ISNULL(AVG (WastePer),0)AS NUMERIC(12,2))  from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgWastePer_ToDay_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG (WastePer),0)AS NUMERIC(12,2))  from @SpgProdn WHERE SpgProdnDate = @ToDate AND ShiftCode = 4  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgWastePer_ToDay_NightShift,

	(SELECT  CAST(ISNULL(AVG (WastePer),0)AS NUMERIC(12,2))  from @SpgProdn WHERE WastePer > 0 AND SpgProdnDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgWastePer_ToDay ,

	(SELECT  CAST(ISNULL(AVG (WastePer),0)AS NUMERIC(12,2))  from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 2  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgWastePer_UpToDate_DayShift ,
	(SELECT  CAST(ISNULL(AVG(WastePer),0) AS NUMERIC(12,2))  from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS SpgWastePer_UpToDate_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG(WastePer),0)AS NUMERIC(12,2))   from @SpgProdn WHERE SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate AND ShiftCode = 4   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS SpgWastePer_UpToDate_NightShift,

	(SELECT  CAST(ISNULL(AVG(WastePer),0)AS NUMERIC(12,2))   from @SpgProdn WHERE WastePer > 0 AND  SpgProdnDate >= @FromDate AND SpgProdnDate <= @ToDate   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS SpgWastePer_UpToDate ,

	(SELECT  CAST(ISNULL(AVG(WastePer),0)AS NUMERIC(12,2))   from @SpgProdn WHERE WastePer > 0 AND  SpgProdnDate >= @FromDate_PrevMonth AND SpgProdnDate <= @ToDate_PrevMonth   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS SpgWastePer_PrevMonth ,

----PRODUCTION - AUTOCONER ===========================================================================================	
	(SELECT CAST(ISNULL(SUM (ProdnKgs),0) AS INT) from @ACProdn WHERE ACProdnDate = @YesterDay   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ACProdn_YesterDay,
	(SELECT CAST(ISNULL(SUM (ProdnKgs),0) AS INT) from @ACProdn WHERE ACProdnDate = @ToDate AND ShiftCode = 2  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACProdn_ToDay_DayShift ,
	(SELECT CAST(ISNULL(SUM (ProdnKgs),0) AS INT) from @ACProdn WHERE ACProdnDate = @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACProdn_ToDay_HalfNightShift, 
	(SELECT CAST(ISNULL(SUM (ProdnKgs),0) AS INT) from @ACProdn WHERE ACProdnDate = @ToDate AND ShiftCode = 4   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ACProdn_ToDay_NightShift,
	
    (SELECT CAST(ISNULL(SUM (ProdnKgs),0) AS INT) from @ACProdn WHERE ACProdnDate = @ToDate   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ACProdn_ToDay,
		
    (SELECT CAST(ISNULL(SUM (ProdnKgs),0) AS INT) from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND ShiftCode = 2   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ACProdn_UpToDate_DayShift ,
	(SELECT CAST(ISNULL(SUM (ProdnKgs),0) AS INT) from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACProdn_UpToDate_HalfNightShift, 
	(SELECT CAST(ISNULL(SUM (ProdnKgs),0) AS INT) from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND ShiftCode = 4  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACProdn_UpToDate_NightShift, 
	
	(SELECT CAST(ISNULL(SUM (ProdnKgs),0) AS INT) from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACProdn_UpToDate, 
	
	(SELECT CAST(ISNULL(SUM (ProdnKgs),0) AS INT) from @ACProdn WHERE ACProdnDate >= @FromDate_PrevMonth AND ACProdnDate <= @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACProdn_PrevMonth, 
	
	(SELECT  CAST(ISNULL(AVG (ProdnEffi),0)AS NUMERIC(12,2))  from @ACProdn WHERE ProdnEffi > 0 AND ACProdnDate = @YesterDay   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACEff_YesterDay ,
	(SELECT  CAST(ISNULL(AVG (ProdnEffi),0) AS NUMERIC(12,2)) from @ACProdn WHERE ACProdnDate = @ToDate AND ShiftCode = 2   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ACEff_ToDay_DayShift ,
	(SELECT  CAST(ISNULL(AVG (ProdnEffi),0)AS NUMERIC(12,2))  from @ACProdn WHERE ACProdnDate = @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACEff_ToDay_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG (ProdnEffi),0)AS NUMERIC(12,2))  from @ACProdn WHERE ACProdnDate = @ToDate AND ShiftCode = 4  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACEff_ToDay_NightShift,
	
	(SELECT  CAST(ISNULL(AVG (ProdnEffi),0)AS NUMERIC(12,2))  from @ACProdn WHERE ProdnEffi > 0 AND ACProdnDate = @ToDate   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACEff_ToDay ,
	
	(SELECT  CAST(ISNULL(AVG (ProdnEffi),0)AS NUMERIC(12,2))  from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND ShiftCode = 2  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACEff_UpToDate_DayShift ,
	(SELECT  CAST(ISNULL(AVG(ProdnEffi),0) AS NUMERIC(12,2))  from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACEff_UpToDate_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG(ProdnEffi),0)AS NUMERIC(12,2))   from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND ShiftCode = 4   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ACEff_UpToDate_NightShift ,
	
	(SELECT  CAST(ISNULL(AVG(ProdnEffi),0)AS NUMERIC(12,2))   from @ACProdn WHERE ProdnEffi > 0 AND  ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ACEff_UpToDate ,
	
	(SELECT  CAST(ISNULL(AVG(ProdnEffi),0)AS NUMERIC(12,2))   from @ACProdn WHERE ProdnEffi > 0 AND  ACProdnDate >= @FromDate_PrevMonth AND ACProdnDate <= @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ACEff_PrevMonth ,
	
	(SELECT  CAST(ISNULL(AVG (Utilisation),0)AS NUMERIC(12,2))  from @ACProdn WHERE Utilisation > 0 AND ACProdnDate = @YesterDay  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACUtil_YesterDay,
	(SELECT  CAST(ISNULL(AVG (Utilisation),0) AS NUMERIC(12,2)) from @ACProdn WHERE ACProdnDate = @ToDate AND ShiftCode = 2  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACUtil_ToDay_DayShift ,
	(SELECT  CAST(ISNULL(AVG (Utilisation),0)AS NUMERIC(12,2))  from @ACProdn WHERE ACProdnDate = @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACUtil_ToDay_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG (Utilisation),0)AS NUMERIC(12,2))  from @ACProdn WHERE ACProdnDate = @ToDate AND ShiftCode = 4  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACUtil_ToDay_NightShift,
	
	(SELECT  CAST(ISNULL(AVG (Utilisation),0)AS NUMERIC(12,2))  from @ACProdn WHERE Utilisation > 0 AND ACProdnDate = @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACUtil_ToDay,
		
	(SELECT  CAST(ISNULL(AVG (Utilisation),0)AS NUMERIC(12,2))  from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND ShiftCode = 2   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ACUtil_UpToDate_DayShift ,
	(SELECT  CAST(ISNULL(AVG(Utilisation),0) AS NUMERIC(12,2))  from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACUtil_UpToDate_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG(Utilisation),0)AS NUMERIC(12,2))   from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND ShiftCode = 4  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACUtil_UpToDate_NightShift ,
	 
	(SELECT  CAST(ISNULL(AVG(Utilisation),0)AS NUMERIC(12,2))   from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACUtil_UpToDate  ,
	 
	 (SELECT  CAST(ISNULL(AVG(Utilisation),0)AS NUMERIC(12,2))  from @ACProdn WHERE ACProdnDate >= @FromDate_PrevMonth AND ACProdnDate <= @ToDate_PrevMonth  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACUtil_PrevMonth  ,
	 
	 (SELECT  CAST(ISNULL(AVG (WastePer),0)AS NUMERIC(12,2))   from @ACProdn WHERE ACProdnDate = @YesterDay AND   CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACWastePer_YesterDay,
	(SELECT  CAST(ISNULL(AVG (WastePer),0) AS NUMERIC(12,2))   from @ACProdn WHERE ACProdnDate = @ToDate AND ShiftCode = 2  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACWastePer_ToDay_DayShift ,
	(SELECT  CAST(ISNULL(AVG (WastePer),0)AS NUMERIC(12,2))    from @ACProdn WHERE ACProdnDate = @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACWastePer_ToDay_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG (WastePer),0)AS NUMERIC(12,2))    from @ACProdn WHERE ACProdnDate = @ToDate AND ShiftCode = 4  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACWastePer_ToDay_NightShift,
	
	(SELECT  CAST(ISNULL(AVG (WastePer),0)AS NUMERIC(12,2))    from @ACProdn WHERE ACProdnDate = @ToDate AND   CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACWastePer_ToDay,
	
	(SELECT  CAST(ISNULL(AVG (WastePer),0)AS NUMERIC(12,2))   from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND ShiftCode = 2  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACWastePer_UpToDate_DayShift ,
	(SELECT  CAST(ISNULL(AVG(WastePer),0) AS NUMERIC(12,2))   from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND ShiftCode = 3  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode) ) AS ACWastePer_UpToDate_HalfNightShift, 
	(SELECT  CAST(ISNULL(AVG(WastePer),0)AS NUMERIC(12,2))   from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND ShiftCode = 4   AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ACWastePer_UpToDate_NightShift,

	(SELECT  CAST(ISNULL(AVG(WastePer),0)AS NUMERIC(12,2))   from @ACProdn WHERE ACProdnDate >= @FromDate AND ACProdnDate <= @ToDate AND    CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ACWastePer_UpToDate ,

	(SELECT  CAST(ISNULL(AVG(WastePer),0)AS NUMERIC(12,2))   from @ACProdn WHERE ACProdnDate >= @FromDate_PrevMonth AND ACProdnDate <= @ToDate_PrevMonth AND    CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS ACWastePer_PrevMonth ,
	


----MAINTENANCE ===========================================================================================

---------MECHANICAL============================================================
	(SELECT COUNT(DepartmentCode) AS NOS  
	from @Maintenance WHERE  Servicetype = 'M' AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)
	AND DATEDIFF(D,isnull(DATEADD(d,DurationDays,LastMaintenanceDate),NextServiceDate) ,GETDATE())=0) AS Schedule_ToDay_Mechanical, 

	(SELECT COUNT(DepartmentCode) AS NOS  
	from @Maintenance WHERE  Servicetype = 'M'  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)
	AND DATEDIFF(D,isnull(DATEADD(d,DurationDays,LastMaintenanceDate),NextServiceDate) ,GETDATE())>0) AS Schedule_Pending_Mechanical, 		
			 
	-------ELECTRICAL============================================================
	(SELECT COUNT(DepartmentCode) AS NOS  
	from @Maintenance WHERE  Servicetype = 'E'  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)
	AND DATEDIFF(D,isnull(DATEADD(d,DurationDays,LastMaintenanceDate),NextServiceDate) ,GETDATE())=0) AS Schedule_ToDay_Electrical,

	(SELECT COUNT(DepartmentCode) AS NOS   
	from @Maintenance WHERE  Servicetype = 'E'  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)
	AND DATEDIFF(D,isnull(DATEADD(d,DurationDays,LastMaintenanceDate),NextServiceDate) ,GETDATE())>0) AS Schedule_Pending_Electrical , 	

----PAYROLL ===========================================================================================	

	(SELECT ISNULL(SUM(GeneralShift),0) from @Strength Where StDate = @ToDate   ) AS AttenToDay_GeneralShift ,	
	(SELECT ISNULL(SUM(IShift),0) from @Strength   Where StDate = @ToDate) AS AttenToDay_IShift ,	
	(SELECT ISNULL(SUM(IIShift),0) from @Strength   Where StDate = @ToDate) AS AttenToDay_IIShift ,	
	(SELECT ISNULL(SUM(IIIShift),0) from @Strength   Where StDate = @ToDate ) AS AttenToDay_IIIShift ,
	(SELECT ISNULL(SUM(GeneralShift),0) + ISNULL(SUM(IShift),0)+ ISNULL(SUM(IIShift),0)+ISNULL(SUM(IIIShift),0) from @Strength WHERE StDate = @ToDate ) AS Atten_Total,
	
	(SELECT ISNULL(SUM(GeneralShift),0) from @Strength Where StDate = DATEADD(D,-1,@ToDate)) AS AttenYesterDay_GeneralShift ,	
	(SELECT ISNULL(SUM(IShift),0) from @Strength   Where StDate = DATEADD(D,-1,@ToDate))  AS AttenYesterDay_IShift ,	
	(SELECT ISNULL(SUM(IIShift),0) from @Strength   Where StDate = DATEADD(D,-1,@ToDate))  AS AttenYesterDay_IIShift ,	
	(SELECT ISNULL(SUM(IIIShift),0) from @Strength   Where StDate = DATEADD(D,-1,@ToDate)) AS AttenYesterDay_IIIShift ,
	--(SELECT ISNULL(SUM(GeneralShift),0) + ISNULL(SUM(IShift),0)+ ISNULL(SUM(IIShift),0)+ISNULL(SUM(IIIShift),0) from @Strength WHERE StDate = DATEADD(D,-1,@ToDate))  AS AttenYesterDay_Total,
	(SELECT COUNT(EmployeeCode) FROM tbl_Employee WHERE LeaveStatus = 'ACTIVE' AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS AttenYesterDay_Total,
	
	
	(SELECT ISNULL(SUM(GeneralShift),0) from @Strength  ) AS AttenUpToDate_GeneralShift ,	
	(SELECT ISNULL(SUM(IShift),0) from @Strength  )  AS AttenUpToDate_IShift ,	
	(SELECT ISNULL(SUM(IIShift),0) from @Strength  )  AS AttenUpToDate_IIShift ,	
	(SELECT ISNULL(SUM(IIIShift),0) from @Strength  ) AS AttenUpToDate_IIIShift ,
	(SELECT ISNULL(SUM(GeneralShift),0) + ISNULL(SUM(IShift),0)+ ISNULL(SUM(IIShift),0)+ISNULL(SUM(IIIShift),0) from @Strength WHERE StDate >= @FromDate AND StDate <= @ToDate)  AS AttenUpToDate_Total,
	
	
	(SELECT ISNULL(SUM(GeneralShift_OT),0) from @Strength Where StDate = @ToDate  ) AS OTToDay_GeneralShift ,	
	(SELECT ISNULL(SUM(IShift_OT),0) from @Strength   Where StDate = @ToDate) AS OTToDay_IShift ,	
	(SELECT ISNULL(SUM(IIShift_OT),0) from @Strength   Where StDate = @ToDate) AS OTToDay_IIShift ,	
	(SELECT ISNULL(SUM(IIIShift_OT),0) from @Strength   Where StDate = @ToDate ) AS OTToDay_IIIShift ,
	ROUND((SELECT ISNULL(SUM(GeneralShift_OT),0) + ISNULL(SUM(IShift_OT),0)+ ISNULL(SUM(IIShift_OT),0)+ISNULL(SUM(IIIShift_OT),0) from @Strength WHERE StDate = @ToDate)/8, 3) AS OT_Total,
	
	(SELECT ISNULL(SUM(GeneralShift_OT),0) from @Strength Where StDate = DATEADD(D,-1,@ToDate)) AS OTYesterDay_GeneralShift ,	
	(SELECT ISNULL(SUM(IShift_OT),0) from @Strength   Where StDate = DATEADD(D,-1,@ToDate))  AS OTYesterDay_IShift ,	
	(SELECT ISNULL(SUM(IIShift_OT),0) from @Strength   Where StDate = DATEADD(D,-1,@ToDate))  AS OTYesterDay_IIShift ,	
	(SELECT ISNULL(SUM(IIIShift_OT),0) from @Strength   Where StDate = DATEADD(D,-1,@ToDate)) AS OTYesterDay_IIIShift ,
	ROUND((SELECT ISNULL(SUM(GeneralShift_OT),0) + ISNULL(SUM(IShift_OT),0)+ ISNULL(SUM(IIShift_OT),0)+ISNULL(SUM(IIIShift_OT),0) from @Strength WHERE StDate = DATEADD(D,-1,@ToDate))/8, 3)  AS OTYesterDay_Total,
	
	(SELECT ISNULL(SUM(GeneralShift_OT),0) from @Strength  ) AS OTUpToDate_GeneralShift ,	
	(SELECT ISNULL(SUM(IShift_OT),0) from @Strength  )  AS OTUpToDate_IShift ,	
	(SELECT ISNULL(SUM(IIShift_OT),0) from @Strength  )  AS OTUpToDate_IIShift ,	
	(SELECT ISNULL(SUM(IIIShift_OT),0) from @Strength  ) AS OTUpToDate_IIIShift ,
	ROUND((SELECT ISNULL(SUM(GeneralShift_OT),0) + ISNULL(SUM(IShift_OT),0)+ ISNULL(SUM(IIShift_OT),0)+ISNULL(SUM(IIIShift_OT),0) from @Strength WHERE StDate >= @FromDate AND StDate <= @ToDate )/8, 3)  AS OTUpToDate_Total, 
	
	
	--(SELECT ISNULL(SUM(ShiftSalary),0) from @Strength Where StDate = @ToDate  ) AS AttenToDay_Salary ,
	--(SELECT ISNULL(SUM(OTSalary),0) from @Strength Where StDate = @ToDate  ) AS AttenToDay_OT,
	
	--(SELECT ISNULL(SUM(ShiftSalary),0) from @Strength Where StDate = @YesterDay) AS AttenYesterDay_Salary ,	
	--(SELECT ISNULL(SUM(OTSalary),0) from @Strength   Where StDate = @YesterDay)  AS AttenYesterDay_OT ,
	
	--(SELECT ISNULL(SUM(ShiftSalary),0) from @Strength WHERE StDate >= @FromDate AND StDate <= @ToDate  ) AS AttenUpToDate_Salary ,	
	--(SELECT ISNULL(SUM(OTSalary),0) from @Strength WHERE StDate >= @FromDate AND StDate <= @ToDate  )  AS AttenUpToDate_OTSalary ,
	
	 -- Current Month
	(SELECT ISNULL(SUM(CASE WHEN MONTH(PayPeriodFrom) = MONTH(GETDATE()) AND YEAR(PayPeriodFrom) = YEAR(GETDATE()) THEN (SR_NET + RewardAmount - OTWages) END),0)FROM vw_Salary 
     WHERE CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS AttenToDay_Salary,
    
    (SELECT ISNULL(SUM(CASE WHEN MONTH(PayPeriodFrom) = MONTH(GETDATE()) AND YEAR(PayPeriodFrom) = YEAR(GETDATE()) THEN OTWages END),0)FROM vw_Salary 
     WHERE CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS AttenToDay_OT,
		
	 -- Last Month
    (SELECT ISNULL(SUM(CASE WHEN MONTH(PayPeriodFrom) = MONTH(DATEADD(MONTH,-1,GETDATE())) AND YEAR(PayPeriodFrom) = YEAR(DATEADD(MONTH,-1,GETDATE())) THEN (SR_NET + RewardAmount - OTWages) END),0) FROM vw_Salary 
     WHERE CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS AttenYesterDay_Salary,
     
     (SELECT ISNULL(SUM(CASE  WHEN MONTH(PayPeriodFrom) = MONTH(DATEADD(MONTH,-1,GETDATE())) AND YEAR(PayPeriodFrom) = YEAR(DATEADD(MONTH,-1,GETDATE())) THEN OTWages END),0)FROM vw_Salary 
     WHERE CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS AttenYesterDay_OT,
     
      -- Previous Month
     (SELECT ISNULL(SUM(CASE  WHEN MONTH(PayPeriodFrom) = MONTH(DATEADD(MONTH,-2,GETDATE())) AND YEAR(PayPeriodFrom) = YEAR(DATEADD(MONTH,-2,GETDATE())) THEN (SR_NET + RewardAmount - OTWages) END),0) FROM vw_Salary 
     WHERE CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS AttenUpToDate_Salary,
     
     (SELECT ISNULL(SUM(CASE WHEN MONTH(PayPeriodFrom) = MONTH(DATEADD(MONTH,-2,GETDATE())) AND YEAR(PayPeriodFrom) = YEAR(DATEADD(MONTH,-2,GETDATE())) THEN OTWages END),0)FROM vw_Salary 
     WHERE CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS AttenUpToDate_OTSalary,
	
	(SELECT COUNT(EmployeeCode) from @Atten where CalendarDate = @ToDate AND LTRIM(DATEDIFF(MINUTE, 0, ISNULL( Late_In,'00:00')))  > 0  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS Employee_LateIn,
	(SELECT COUNT(EmployeeCode) from @Atten where CalendarDate = @ToDate AND LTRIM(DATEDIFF(MINUTE, 0, ISNULL( Early_Out,'00:00')))  > 0  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS Employee_EarlyOut,

	(SELECT COUNT(EmployeeCode) from @Atten where CalendarDate = @YesterDay AND LTRIM(DATEDIFF(MINUTE, 0, ISNULL( Late_In,'00:00')))  > 0  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS Employee_LateIn_YesterDay,
	(SELECT COUNT(EmployeeCode) from @Atten where CalendarDate = @YesterDay AND LTRIM(DATEDIFF(MINUTE, 0, ISNULL( Early_Out,'00:00')))  > 0  AND CompanyCode = ISNULL(@CompanyCode,CompanyCode)) AS Employee_EarlyOut_YesterDay,
	
	(SELECT ISNULL(COUNT(EmployeeCode),0) from tbl_Employee WHERE DateOfJoining  >= @FromDate AND DateOfJoining <= @ToDate  )  AS Employee_NewJoin_ThisMonth,
	(SELECT ISNULL(COUNT(EmployeeCode),0) from tbl_Employee WHERE ISNULL(DOL,'01/12/9999') >= @FromDate AND ISNULL(DOL,'01/12/9999') <= @ToDate  )  AS Employee_Left_ThisMonth
	
	OPTION (RECOMPILE)
	
