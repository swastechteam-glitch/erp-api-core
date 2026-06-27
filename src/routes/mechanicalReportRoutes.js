import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import {
  serviceScheduleDateWise,
  serviceScheduleMachineWise,
  serviceScheduleDepartmentWise,
  serviceScheduleServiceWise,
  scheduleTonnage,
  schedulePendings,
  schedulePendingsWithReason,
  scheduleCost,
  scheduleLastMaintenance,
  scheduleOverallPendings,
  scheduleTonnageSummary,
  scheduleTonnagePendings,
  serviceScheduleOptions
} from "../controllers/report/mechanical/serviceSchedule.js";
import {
  breakDownMachineWise,
  breakDownDepartmentWise,
  breakDownDateWise,
  breakDownCost,
  breakDownDepartmentConsolidate,
  breakDownOptions
} from "../controllers/report/mechanical/breakDown.js";
import {
  workOrderDateWise,
  workOrderDepartmentWise,
  workOrderDetailsMachineWise,
  workOrderDetailsDepartmentWise,
  workOrderDetailsServiceWise,
  workOrderDetailsMachineWiseBreakDown,
  workOrderOptions
} from "../controllers/report/mechanical/workOrder.js";
import {
  nextServiceMachineWise,
  nextServiceDepartmentWise,
  nextServiceServiceWise,
  nextServiceDateWise,
  nextServiceOverAll,
  nextServiceOptions
} from "../controllers/report/mechanical/nextServiceSchedule.js";
import {
  consumptionItemWise,
  consumptionMachineWise,
  consumptionDepartmentWise,
  consumptionDateWise,
  lastConsumptionItemWise,
  lastConsumptionMachineWise,
  breakDownConsumptionItemWise,
  breakDownConsumptionMachineWise,
  maintenanceItemStock,
  nextServiceConsumptionOptions
} from "../controllers/report/mechanical/nextServiceConsumption.js";
import {
  tapeCutItemWise,
  tapeCutDepartmentWise,
  tapeCutMachineWise,
  tapeCutDateWise,
  machineTapeCutOptions
} from "../controllers/report/mechanical/machineTapeCut.js";
import {
  buffingDetail,
  buffingPending,
  buffingDateWise,
  machineBuffingOptions
} from "../controllers/report/mechanical/machineBuffing.js";
import {
  maintenanceLifeSpan
} from "../controllers/report/mechanical/maintenanceLifeSpan.js";
import {
  mechanicalDailyReport,
  mechanicalDailyReportOptions
} from "../controllers/report/mechanical/mechanicalDailyReport.js";
import {
  machineDetailsReport,
  machineDetailsOptions
} from "../controllers/report/mechanical/machineDetails.js";
import {
  machineDocPrintReport,
  machineDocPrintMachines,
  machineDocPrintOptions
} from "../controllers/report/mechanical/machineDocPrint.js";
import {
  typeOfBreakDownReport,
  typeOfBreakDownOptions
} from "../controllers/report/mechanical/typeOfBreakDown.js";
import {
  breakDownMonthWise,
  breakDownYearWise,
  breakDownMonthWiseOptions
} from "../controllers/report/mechanical/breakDownMonthWise.js";

const router = express.Router();

// Mechanical -> Service Schedule
router.get("/service-schedule/date-wise", authenticate, serviceScheduleDateWise);
router.get("/service-schedule/machine-wise", authenticate, serviceScheduleMachineWise);
router.get("/service-schedule/department-wise", authenticate, serviceScheduleDepartmentWise);
router.get("/service-schedule/service-wise", authenticate, serviceScheduleServiceWise);
router.get("/service-schedule/pendings", authenticate, schedulePendings);
router.get("/service-schedule/pendings-with-reason", authenticate, schedulePendingsWithReason);
router.get("/service-schedule/options", authenticate, serviceScheduleOptions);
router.get("/service-schedule/last-maintenance", authenticate, scheduleLastMaintenance);
router.get("/service-schedule/overall-pendings", authenticate, scheduleOverallPendings);
router.get("/service-schedule/tonnage-summary", authenticate, scheduleTonnageSummary);
router.get("/service-schedule/tonnage-pendings", authenticate, scheduleTonnagePendings);

// Mechanical -> Tonnage & Cost
router.get("/tonnage", authenticate, scheduleTonnage);
router.get("/cost", authenticate, scheduleCost);

// Mechanical -> Break Down
router.get("/break-down/machine-wise", authenticate, breakDownMachineWise);
router.get("/break-down/department-wise", authenticate, breakDownDepartmentWise);
router.get("/break-down/date-wise", authenticate, breakDownDateWise);
router.get("/break-down/cost", authenticate, breakDownCost);
router.get("/break-down/options", authenticate, breakDownOptions);
router.get("/break-down/department-wise-consolidate", authenticate, breakDownDepartmentConsolidate);

// Mechanical -> BreakDown MonthWise Report (rptBreakDownMonthWise).
router.get("/break-down-month-wise/options", authenticate, breakDownMonthWiseOptions);
router.get("/break-down-month-wise", authenticate, breakDownMonthWise);
router.get("/break-down-year-wise", authenticate, breakDownYearWise);

// Mechanical -> Work Order (Schedule Complete)
router.get("/work-order/options", authenticate, workOrderOptions);
router.get("/work-order/date-wise", authenticate, workOrderDateWise);
router.get("/work-order/department-wise", authenticate, workOrderDepartmentWise);
router.get("/work-order/details/machine-wise", authenticate, workOrderDetailsMachineWise);
router.get("/work-order/details/department-wise", authenticate, workOrderDetailsDepartmentWise);
router.get("/work-order/details/service-wise", authenticate, workOrderDetailsServiceWise);
router.get("/work-order/details/machine-wise-breakdown", authenticate, workOrderDetailsMachineWiseBreakDown);

// Mechanical -> Next Service Schedule
router.get("/next-service-schedule/machine-wise", authenticate, nextServiceMachineWise);
router.get("/next-service-schedule/department-wise", authenticate, nextServiceDepartmentWise);
router.get("/next-service-schedule/service-wise", authenticate, nextServiceServiceWise);
router.get("/next-service-schedule/date-wise", authenticate, nextServiceDateWise);
router.get("/next-service-schedule/options", authenticate, nextServiceOptions);
router.get("/next-service-schedule/over-all", authenticate, nextServiceOverAll);

// Mechanical -> Next Service Consumption
router.get("/next-service-consumption/date-wise", authenticate, consumptionDateWise);
router.get("/next-service-consumption/item-wise", authenticate, consumptionItemWise);
router.get("/next-service-consumption/machine-wise", authenticate, consumptionMachineWise);
router.get("/next-service-consumption/department-wise", authenticate, consumptionDepartmentWise);
router.get("/next-service-consumption/last/item-wise", authenticate, lastConsumptionItemWise);
router.get("/next-service-consumption/last/machine-wise", authenticate, lastConsumptionMachineWise);
router.get("/next-service-consumption/last/breakdown-item-wise", authenticate, breakDownConsumptionItemWise);
router.get("/next-service-consumption/last/breakdown-machine-wise", authenticate, breakDownConsumptionMachineWise);
router.get("/next-service-consumption/item-stock", authenticate, maintenanceItemStock);
router.get("/next-service-consumption/options", authenticate, nextServiceConsumptionOptions);

// Mechanical -> Machine Tape Cut
router.get("/machine-tape-cut/date-wise", authenticate, tapeCutDateWise);
router.get("/machine-tape-cut/item-wise", authenticate, tapeCutItemWise);
router.get("/machine-tape-cut/department-wise", authenticate, tapeCutDepartmentWise);
router.get("/machine-tape-cut/machine-wise", authenticate, tapeCutMachineWise);
router.get("/machine-tape-cut/options", authenticate, machineTapeCutOptions);

// Mechanical -> Machine Buffing
router.get("/machine-buffing/date-wise", authenticate, buffingDateWise);
router.get("/machine-buffing/detail", authenticate, buffingDetail);
router.get("/machine-buffing/pending", authenticate, buffingPending);
router.get("/machine-buffing/options", authenticate, machineBuffingOptions);

// Mechanical -> Maintenance Life Span (single report)
router.get("/maintenance-life-span", authenticate, maintenanceLifeSpan);

// Mechanical -> Mechanical Daily Report (single day, multi-section)
router.get("/daily-report/options", authenticate, mechanicalDailyReportOptions);
router.get("/daily-report", authenticate, mechanicalDailyReport);

// Mechanical -> Machine Details (rptMachineDetails) — one endpoint, 7 variants
// selected by ?groupBy=, plus a dropdown options endpoint for the filters.
router.get("/machine-details/options", authenticate, machineDetailsOptions);
router.get("/machine-details", authenticate, machineDetailsReport);

// Mechanical -> Machine Details Doc Print (rptMachineDocumentPrint) — machine
// grid + per-machine printable document.
router.get("/machine-doc-print/options", authenticate, machineDocPrintOptions);
router.get("/machine-doc-print/machines", authenticate, machineDocPrintMachines);
router.get("/machine-doc-print", authenticate, machineDocPrintReport);

// Mechanical -> Type of Break Downs Report (rptTypeOfBreakDown) — no date range.
router.get("/type-of-breakdown/options", authenticate, typeOfBreakDownOptions);
router.get("/type-of-breakdown", authenticate, typeOfBreakDownReport);

export default router;
