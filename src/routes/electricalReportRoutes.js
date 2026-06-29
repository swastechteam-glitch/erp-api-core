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
  scheduleCost
} from "../controllers/report/electrical/serviceSchedule.js";
import {
  breakDownMachineWise,
  breakDownDepartmentWise,
  breakDownDateWise,
  breakDownCost
} from "../controllers/report/electrical/breakDown.js";
import {
  workOrderDateWise,
  workOrderDepartmentWise,
  workOrderDetailsMachineWise,
  workOrderDetailsDepartmentWise,
  workOrderDetailsServiceWise,
  workOrderDetailsMachineWiseBreakDown
} from "../controllers/report/electrical/workOrder.js";
import {
  nextServiceMachineWise,
  nextServiceDepartmentWise,
  nextServiceServiceWise,
  nextServiceDateWise
} from "../controllers/report/electrical/nextServiceSchedule.js";
import {
  consumptionItemWise,
  consumptionMachineWise,
  consumptionDepartmentWise,
  consumptionDateWise,
  lastConsumptionItemWise,
  lastConsumptionMachineWise,
  maintenanceItemStock
} from "../controllers/report/electrical/nextServiceConsumption.js";
import { electricalDailyReport } from "../controllers/report/electrical/dailyReport.js";
import {
  ebReadingDateWise,
  ebReadingPlantWise,
  ebReadingPowerGroupWise,
  ebReadingMonthWise,
  departmentEbReadingOptions
} from "../controllers/report/electrical/departmentEbReading.js";
import {
  dayWiseReadingDateWise,
  ukgDateWise,
  ukgMonthWise,
  ukgYearWise,
  ebReadingWithSolar,
  ebReadingWithoutSolar,
  dayWiseEbReadingOptions
} from "../controllers/report/electrical/dayWiseEbReading.js";
import {
  slotDateWise,
  slotMonthWise,
  slotYearWise,
  powerCategoryDateWise
} from "../controllers/report/electrical/slotWiseEbReading.js";
import {
  solarDateWise,
  solarMonthWise,
  solarPerKwDateWise,
  solarPerKwMonthWise,
  solarReadingOptions
} from "../controllers/report/electrical/solarReading.js";
import {
  powerFailureIndividual,
  powerFailureCumulative,
  powerFailureOptions
} from "../controllers/report/electrical/ebPowerFailure.js";
import {
  dieselDateWise,
  dieselConsumptionOptions
} from "../controllers/report/electrical/dieselConsumption.js";
import {
  generatorDateWise,
  generatorMonthWise,
  generatorReadingOptions
} from "../controllers/report/electrical/generatorReading.js";
import {
  compressorDateWise,
  compressorPerformance,
  compressorMonthWise,
  compressorMachineWise,
  compressorReadingOptions
} from "../controllers/report/electrical/compressorReading.js";
import { electricalEbReadingDateWise } from "../controllers/report/electrical/electricalEbReading.js";
import { ebBillDateWise } from "../controllers/report/electrical/ebBillMonthly.js";
import {
  electricalCheckList,
  rsbCheckList,
  spgUkgCheckList,
  electricalCheckListOptions
} from "../controllers/report/electrical/electricalCheckList.js";

const router = express.Router();

// Electrical -> Service Schedule
router.get("/service-schedule/date-wise", authenticate, serviceScheduleDateWise);
router.get("/service-schedule/machine-wise", authenticate, serviceScheduleMachineWise);
router.get("/service-schedule/department-wise", authenticate, serviceScheduleDepartmentWise);
router.get("/service-schedule/service-wise", authenticate, serviceScheduleServiceWise);
router.get("/service-schedule/pendings", authenticate, schedulePendings);
router.get("/service-schedule/pendings-with-reason", authenticate, schedulePendingsWithReason);

// Electrical -> Tonnage & Cost
router.get("/tonnage", authenticate, scheduleTonnage);
router.get("/cost", authenticate, scheduleCost);

// Electrical -> Break Down
router.get("/break-down/date-wise", authenticate, breakDownDateWise);
router.get("/break-down/machine-wise", authenticate, breakDownMachineWise);
router.get("/break-down/department-wise", authenticate, breakDownDepartmentWise);
router.get("/break-down/cost", authenticate, breakDownCost);

// Electrical -> Work Order (Schedule Complete)
router.get("/work-order/date-wise", authenticate, workOrderDateWise);
router.get("/work-order/department-wise", authenticate, workOrderDepartmentWise);
router.get("/work-order/details/machine-wise", authenticate, workOrderDetailsMachineWise);
router.get("/work-order/details/department-wise", authenticate, workOrderDetailsDepartmentWise);
router.get("/work-order/details/service-wise", authenticate, workOrderDetailsServiceWise);
router.get("/work-order/details/machine-wise-breakdown", authenticate, workOrderDetailsMachineWiseBreakDown);

// Electrical -> Next Service Schedule
router.get("/next-service-schedule/date-wise", authenticate, nextServiceDateWise);
router.get("/next-service-schedule/machine-wise", authenticate, nextServiceMachineWise);
router.get("/next-service-schedule/department-wise", authenticate, nextServiceDepartmentWise);
router.get("/next-service-schedule/service-wise", authenticate, nextServiceServiceWise);

// Electrical -> Next Service Consumption
router.get("/next-service-consumption/date-wise", authenticate, consumptionDateWise);
router.get("/next-service-consumption/item-wise", authenticate, consumptionItemWise);
router.get("/next-service-consumption/machine-wise", authenticate, consumptionMachineWise);
router.get("/next-service-consumption/department-wise", authenticate, consumptionDepartmentWise);
router.get("/next-service-consumption/last/item-wise", authenticate, lastConsumptionItemWise);
router.get("/next-service-consumption/last/machine-wise", authenticate, lastConsumptionMachineWise);
router.get("/next-service-consumption/item-stock", authenticate, maintenanceItemStock);

// Electrical -> Electrical Daily Report (composite, ServiceType=E)
router.get("/daily-report", authenticate, electricalDailyReport);

// Electrical -> Department EB Reading (Power Consumption)
router.get("/department-eb-reading/date-wise", authenticate, ebReadingDateWise);
router.get("/department-eb-reading/plant-wise", authenticate, ebReadingPlantWise);
router.get("/department-eb-reading/power-group-wise", authenticate, ebReadingPowerGroupWise);
router.get("/department-eb-reading/month-wise", authenticate, ebReadingMonthWise);
router.get("/department-eb-reading/options", authenticate, departmentEbReadingOptions);

// Electrical -> Day Wise EB Reading (sp_EBDaysWise_Report)
router.get("/day-wise-eb-reading/date-wise", authenticate, dayWiseReadingDateWise);
router.get("/day-wise-eb-reading/ukg-date-wise", authenticate, ukgDateWise);
router.get("/day-wise-eb-reading/ukg-month-wise", authenticate, ukgMonthWise);
router.get("/day-wise-eb-reading/ukg-year-wise", authenticate, ukgYearWise);
router.get("/day-wise-eb-reading/with-solar", authenticate, ebReadingWithSolar);
router.get("/day-wise-eb-reading/without-solar", authenticate, ebReadingWithoutSolar);
router.get("/day-wise-eb-reading/options", authenticate, dayWiseEbReadingOptions);

// Electrical -> Slot Wise EB Reading
router.get("/slot-wise-eb-reading/date-wise", authenticate, slotDateWise);
router.get("/slot-wise-eb-reading/month-wise", authenticate, slotMonthWise);
router.get("/slot-wise-eb-reading/year-wise", authenticate, slotYearWise);
router.get("/slot-wise-eb-reading/power-category-date-wise", authenticate, powerCategoryDateWise);

// Electrical -> Solar Reading
router.get("/solar-reading/date-wise", authenticate, solarDateWise);
router.get("/solar-reading/month-wise", authenticate, solarMonthWise);
router.get("/solar-reading/per-kw-date-wise", authenticate, solarPerKwDateWise);
router.get("/solar-reading/per-kw-month-wise", authenticate, solarPerKwMonthWise);
router.get("/solar-reading/options", authenticate, solarReadingOptions);

// Electrical -> EB Power Failure
router.get("/eb-power-failure/date-wise", authenticate, powerFailureCumulative);
router.get("/eb-power-failure/individual", authenticate, powerFailureIndividual);
router.get("/eb-power-failure/options", authenticate, powerFailureOptions);

// Electrical -> Diesel Consumption
router.get("/diesel-consumption/date-wise", authenticate, dieselDateWise);
router.get("/diesel-consumption/options", authenticate, dieselConsumptionOptions);

// Electrical -> Generator Reading
router.get("/generator-reading/date-wise", authenticate, generatorDateWise);
router.get("/generator-reading/month-wise", authenticate, generatorMonthWise);
router.get("/generator-reading/options", authenticate, generatorReadingOptions);

// Electrical -> Compressor Reading
router.get("/compressor-reading/date-wise", authenticate, compressorDateWise);
router.get("/compressor-reading/performance", authenticate, compressorPerformance);
router.get("/compressor-reading/month-wise", authenticate, compressorMonthWise);
router.get("/compressor-reading/machine-wise", authenticate, compressorMachineWise);
router.get("/compressor-reading/options", authenticate, compressorReadingOptions);

// Electrical -> Electrical EB Reading (composite daily report)
router.get("/electrical-eb-reading/date-wise", authenticate, electricalEbReadingDateWise);

// Electrical -> EB Bill Monthly
router.get("/eb-bill-monthly/date-wise", authenticate, ebBillDateWise);

// Electrical -> Electrical Check List (Check List / RSB / SPG UKG templates)
router.get("/electrical-check-list/check-list", authenticate, electricalCheckList);
router.get("/electrical-check-list/rsb", authenticate, rsbCheckList);
router.get("/electrical-check-list/spg-ukg", authenticate, spgUkgCheckList);
router.get("/electrical-check-list/options", authenticate, electricalCheckListOptions);

export default router;
