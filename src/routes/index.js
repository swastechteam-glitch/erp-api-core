import express from "express";
import userRouter from "./usersRoutes.js";
import authRouter from "./authRoutes.js";
import commonRouter from "./commonRoutes.js";
import cottonRouter from "./cottonRoutes.js";
import yarnRouter from "./yarnRoutes.js";
import storesRouter from "./storesRoutes.js";
import hrmRouter from "./hrmRoutes.js";
import gateRouter from "./gateRoutes.js";
import financeRouter from "./financeRoutes.js";
import wasteRouter from "./wasteRoutes.js";
import mechanicalRouter from "./mehanicalRoutes.js";
import cottonOverviewRouter from "./cottonOverviewRoutes.js";
import yarnOverviewRouter from "./yarnOverviewRoutes.js";
import storeOverviewRouter from "./storeOverviewRoutes.js";
import hrmOverviewRouter from "./hrmOverviewRoutes.js";
import gateOverviewRouter from "./gateOverviewRoutes.js";
import financeOverviewRouter from "./financeOverviewRoutes.js";
import cottonReportRoutes from "./cottonReportRoutes.js";
import yarnReportRoutes from "./yarnReportRoutes.js";
import storeReportRoutes from "./storeReportRoutes.js";
import hrmReportRoutes from "./hrmReportRoutes.js";
import payrollReportRoutes from "./payrollReportRoutes.js";
import productionReportRoutes from "./productionReportRoutes.js";
import wasteReportRoutes from "./wasteReportRoutes.js";
import mechanicalReportRoutes from "./mechanicalReportRoutes.js";
import electricalReportRoutes from "./electricalReportRoutes.js";
import weighbridgeReportRoutes from "./weighbridgeReportRoutes.js";
import costingReportRoutes from "./costingReportRoutes.js";
import documentReportRoutes from "./documentReportRoutes.js";
import graphRoutes from "./graphRoutes.js";
import dashboardRoutes from "./dashboardRoutes.js";
import locationRoutes from "./loginLogsRoutes.js";
import { testDBConnection } from "../controllers/testController.js";
import bullMQRoutes from "../routes/bullMQRoutes.js";
import {
  getNotificationCount,
  notificationUpdate,
  saveFCMToken,
} from "../controllers/notifications.comtroller.js";
import { authenticate } from "../middleware/authMiddleware.js";
import notificationRouter from "./notificationRoutes.js";
import employeeAllotment from "./employeeAllotmentRoutes.js";
import pdfReport from "./pdfReportRoutes.js";
import bankRouter from "./bankRoutes.js";
import maintenanceGroupRouter from "./maintenanceGroupRoutes.js";
import departmentGroupRouter from "./departmentGroupRoutes.js";
import departmentRouter from "./departmentRoutes.js";
import companyRouter from "./companyRoutes.js";
import approvalRouter from "./approvalRoutes.js";
import costHeadRouter from "./costHeadRoutes.js";
import stateRouter from "./stateRoutes.js";
import godownRouter from "./godownRoutes.js";
import districtRouter from "./districtRoutes.js";
import costingMasterRouter from "./costingMasterRoutes.js";
import itemCategoryRouter from "./itemCategoryRoutes.js";

const router = express.Router();

const appRoutes = () => {
  router.use("/user", userRouter);
  router.use("/auth", authRouter);
  router.use("/badge", commonRouter);
  router.use("/cotton", cottonRouter);
  router.use("/cotton/overview", cottonOverviewRouter);
  router.use("/yarn", yarnRouter);
  router.use("/yarn/overview", yarnOverviewRouter);
  router.use("/stores", storesRouter);
  router.use("/stores/overview", storeOverviewRouter);
  router.use("/hrm", hrmRouter);
  router.use("/hrm/overview", hrmOverviewRouter);
  router.use("/gate", gateRouter);
  router.use("/gate/overview", gateOverviewRouter);
  router.use("/finance", financeRouter);
  router.use("/finance/overview", financeOverviewRouter);
  router.use("/bank", bankRouter);
  router.use("/maintenance-group", maintenanceGroupRouter);
  router.use("/department-group", departmentGroupRouter);
  router.use("/department", departmentRouter);
  router.use("/approval", approvalRouter);
  router.use("/cost-head", costHeadRouter);
  router.use("/state", stateRouter);
  router.use("/godown", godownRouter);
  router.use("/district", districtRouter);
  router.use("/costing-master", costingMasterRouter);
  router.use("/item-category", itemCategoryRouter);
  router.use("/mechanical", mechanicalRouter);

  //REPORTS
  router.use("/cotton/reports", cottonReportRoutes);
  router.use("/yarn/reports", yarnReportRoutes);
  router.use("/store/reports", storeReportRoutes);
  router.use("/hrm/reports", hrmReportRoutes);
  router.use("/payroll/reports", payrollReportRoutes);
  router.use("/production/reports", productionReportRoutes);
  router.use("/waste/reports", wasteReportRoutes);
  router.use("/mechanical/reports", mechanicalReportRoutes);
  router.use("/electrical/reports", electricalReportRoutes);
  router.use("/weighbridge/reports", weighbridgeReportRoutes);
  router.use("/costing/reports", costingReportRoutes);
  router.use("/document/reports", documentReportRoutes);

  // Dashboard Graph API's
  router.use("/graph", graphRoutes);

  // Mobile Dashboard
  router.use("/home", dashboardRoutes);

  //   Test DB
  router.get("/company", testDBConnection);
  router.use("/company", companyRouter);

  router.use("/location", locationRoutes);

  router.use("/bull-queue", bullMQRoutes);

  router.use("/notification/count", authenticate, getNotificationCount);
  // router.use("/save-fcm-token",  authenticate ,saveFCMToken);
  router.use("/notification", notificationRouter);
  router.use("/allotment", employeeAllotment);
  router.use("/report", pdfReport);
 

  return router;
};

export default appRoutes;
