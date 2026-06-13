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
} from "../controllers/report/mechanical/serviceSchedule.js";
import {
  breakDownMachineWise,
  breakDownDepartmentWise,
  breakDownDateWise,
  breakDownCost
} from "../controllers/report/mechanical/breakDown.js";
import {
  workOrderDateWise,
  workOrderDepartmentWise,
  workOrderDetailsMachineWise,
  workOrderDetailsDepartmentWise,
  workOrderDetailsServiceWise,
  workOrderDetailsMachineWiseBreakDown
} from "../controllers/report/mechanical/workOrder.js";
import {
  nextServiceMachineWise,
  nextServiceDepartmentWise,
  nextServiceServiceWise,
  nextServiceDateWise
} from "../controllers/report/mechanical/nextServiceSchedule.js";
import {
  consumptionItemWise,
  consumptionMachineWise,
  consumptionDepartmentWise,
  consumptionDateWise,
  lastConsumptionItemWise,
  lastConsumptionMachineWise,
  maintenanceItemStock
} from "../controllers/report/mechanical/nextServiceConsumption.js";
import {
  tapeCutItemWise,
  tapeCutDepartmentWise,
  tapeCutMachineWise,
  tapeCutDateWise
} from "../controllers/report/mechanical/machineTapeCut.js";
import {
  buffingDetail,
  buffingPending,
  buffingDateWise
} from "../controllers/report/mechanical/machineBuffing.js";
import {
  maintenanceLifeSpan
} from "../controllers/report/mechanical/maintenanceLifeSpan.js";
import {
  mechanicalDailyReport
} from "../controllers/report/mechanical/mechanicalDailyReport.js";

const router = express.Router();

// Mechanical -> Service Schedule
router.get("/service-schedule/date-wise", authenticate, serviceScheduleDateWise);
router.get("/service-schedule/machine-wise", authenticate, serviceScheduleMachineWise);
router.get("/service-schedule/department-wise", authenticate, serviceScheduleDepartmentWise);
router.get("/service-schedule/service-wise", authenticate, serviceScheduleServiceWise);
router.get("/service-schedule/pendings", authenticate, schedulePendings);
router.get("/service-schedule/pendings-with-reason", authenticate, schedulePendingsWithReason);

// Mechanical -> Tonnage & Cost
router.get("/tonnage", authenticate, scheduleTonnage);
router.get("/cost", authenticate, scheduleCost);

// Mechanical -> Break Down
router.get("/break-down/machine-wise", authenticate, breakDownMachineWise);
router.get("/break-down/department-wise", authenticate, breakDownDepartmentWise);
router.get("/break-down/date-wise", authenticate, breakDownDateWise);
router.get("/break-down/cost", authenticate, breakDownCost);

// Mechanical -> Work Order (Schedule Complete)
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

// Mechanical -> Next Service Consumption
router.get("/next-service-consumption/date-wise", authenticate, consumptionDateWise);
router.get("/next-service-consumption/item-wise", authenticate, consumptionItemWise);
router.get("/next-service-consumption/machine-wise", authenticate, consumptionMachineWise);
router.get("/next-service-consumption/department-wise", authenticate, consumptionDepartmentWise);
router.get("/next-service-consumption/last/item-wise", authenticate, lastConsumptionItemWise);
router.get("/next-service-consumption/last/machine-wise", authenticate, lastConsumptionMachineWise);
router.get("/next-service-consumption/item-stock", authenticate, maintenanceItemStock);

// Mechanical -> Machine Tape Cut
router.get("/machine-tape-cut/date-wise", authenticate, tapeCutDateWise);
router.get("/machine-tape-cut/item-wise", authenticate, tapeCutItemWise);
router.get("/machine-tape-cut/department-wise", authenticate, tapeCutDepartmentWise);
router.get("/machine-tape-cut/machine-wise", authenticate, tapeCutMachineWise);

// Mechanical -> Machine Buffing
router.get("/machine-buffing/date-wise", authenticate, buffingDateWise);
router.get("/machine-buffing/detail", authenticate, buffingDetail);
router.get("/machine-buffing/pending", authenticate, buffingPending);

// Mechanical -> Maintenance Life Span (single report)
router.get("/maintenance-life-span", authenticate, maintenanceLifeSpan);

// Mechanical -> Mechanical Daily Report (single day, multi-section)
router.get("/daily-report", authenticate, mechanicalDailyReport);

export default router;
