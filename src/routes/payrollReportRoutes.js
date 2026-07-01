import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";

// Payroll -> Master Report
import { employeeRegisterDepartmentWiseReport } from "../controllers/report/payroll/employeeRegisterDepartmentWise.js";
import { employeeTSCRegisterReport } from "../controllers/report/payroll/employeeTSCRegister.js";
import { employeeAgentWiseReport } from "../controllers/report/payroll/employeeAgentWiseReport.js";
import { employeeProofRegisterReport } from "../controllers/report/payroll/employeeProofRegister.js";
import { employeeBankAccountRegisterReport } from "../controllers/report/payroll/employeeBankAccountRegister.js";
import { employeeAdolescentReport } from "../controllers/report/payroll/employeeAdolescentReport.js";
import { departmentWiseShiftListAbstractReport } from "../controllers/report/payroll/departmentWiseShiftListAbstract.js";
import { agentWiseDepartmentAbstractReport } from "../controllers/report/payroll/agentWiseDepartmentAbstract.js";
import { agentWiseHostelAbstractReport } from "../controllers/report/payroll/agentWiseHostelAbstract.js";
import { employeeBatchWiseReport } from "../controllers/report/payroll/employeeBatchWiseReport.js";
import { employeeHostelTypeWiseReport } from "../controllers/report/payroll/employeeHostelTypeWiseReport.js";
import { employeeRoomListReport } from "../controllers/report/payroll/employeeRoomListReport.js";
import { employeePFandESIReport } from "../controllers/report/payroll/employeePFandESIReport.js";
import { employeeMasterOptions } from "../controllers/report/payroll/masterOptions.js";
import { designationChangeReport } from "../controllers/report/payroll/designationChange.js";

// Payroll -> New Joining Report
import { newJoiningAgentWiseReport } from "../controllers/report/payroll/newJoiningAgentWise.js";
import { newJoiningDepartmentWiseReport } from "../controllers/report/payroll/newJoiningDepartmentWise.js";

// Payroll -> Left Report
import { employeeLeftDepartmentWiseReport } from "../controllers/report/payroll/employeeLeftDepartmentWise.js";
import { employeeLeftAgentWiseReport } from "../controllers/report/payroll/employeeLeftAgentWise.js";

// Payroll -> Left & New Join Report
import { joinLeftAgentWiseReport } from "../controllers/report/payroll/joinLeftAgentWise.js";
import { joinLeftDepartmentWiseReport } from "../controllers/report/payroll/joinLeftDepartmentWise.js";

// Payroll -> Attendance Report
import { attendanceDateWiseReport } from "../controllers/report/payroll/attendanceDateWise.js";
import { attendanceLateInReport } from "../controllers/report/payroll/attendanceLateIn.js";
import { attendanceManualEntryReport } from "../controllers/report/payroll/attendanceManualEntry.js";
import { attendanceMisMatchReport } from "../controllers/report/payroll/attendanceMisMatch.js";
import { attendanceMisPunchVsManualReport } from "../controllers/report/payroll/attendanceMisPunchVsManual.js";
import { attendanceDetailsReport } from "../controllers/report/payroll/attendanceDetails.js";
import { movementDetailsReport } from "../controllers/report/payroll/movementDetails.js";
import { attendanceOverAllReport } from "../controllers/report/payroll/attendanceOverAll.js";
import { leaveDetailsReport } from "../controllers/report/payroll/leaveDetails.js";
import { attendanceDetailsGOTSReport } from "../controllers/report/payroll/attendanceDetailsGOTS.js";

// Payroll -> Strength Report
import { strengthAbstractReport } from "../controllers/report/payroll/strengthAbstract.js";

// Payroll -> Costing Report
import { payrollCostingReport } from "../controllers/report/payroll/costingReport.js";

// Payroll -> Time Card
import { timeCardReport } from "../controllers/report/payroll/timeCard.js";

// Payroll -> Muster Report (rptMuster) + Muster Report ALL (rptMusterAll)
import { musterReport, musterReportOptions, musterAllReport, musterAllReportOptions } from "../controllers/report/payroll/muster.js";

// Payroll -> Form 25 (rptForm25) — statutory Muster Roll register
import { form25Report, form25ReportOptions } from "../controllers/report/payroll/form25.js";

// Payroll -> Monthly Salary Details (rptMonthlySalaryDetails)
import { monthlySalaryReport, monthlySalaryReportOptions } from "../controllers/report/payroll/monthlySalary.js";

const router = express.Router();

// Payroll -> Master Report
router.get('/master/register-department-wise', authenticate, employeeRegisterDepartmentWiseReport);
router.get('/master/tsc-register', authenticate, employeeTSCRegisterReport);
router.get('/master/employee-agent-wise', authenticate, employeeAgentWiseReport);
router.get('/master/proof-register', authenticate, employeeProofRegisterReport);
router.get('/master/bank-account-register', authenticate, employeeBankAccountRegisterReport);
router.get('/master/adolescent', authenticate, employeeAdolescentReport);
router.get('/master/department-wise-shift-abstract', authenticate, departmentWiseShiftListAbstractReport);
router.get('/master/agent-wise-department-abstract', authenticate, agentWiseDepartmentAbstractReport);
router.get('/master/agent-wise-hostel-abstract', authenticate, agentWiseHostelAbstractReport);
router.get('/master/batch-wise', authenticate, employeeBatchWiseReport);
router.get('/master/hostel-type-wise', authenticate, employeeHostelTypeWiseReport);
router.get('/master/room-list', authenticate, employeeRoomListReport);
router.get('/master/pf-esi-register', authenticate, employeePFandESIReport);
// Filter-rail lookup lists for the Employee Master (rptEmployeeMaster) screen.
router.get('/master/options', authenticate, employeeMasterOptions);

// Payroll -> Department / Designation Change Report (rptDesignationChange).
router.get('/designation-change', authenticate, designationChangeReport);

// Payroll -> New Joining Report
router.get('/new-joining/agent-wise', authenticate, newJoiningAgentWiseReport);
router.get('/new-joining/department-wise', authenticate, newJoiningDepartmentWiseReport);

// Payroll -> Left Report
router.get('/left/department-wise', authenticate, employeeLeftDepartmentWiseReport);
router.get('/left/agent-wise', authenticate, employeeLeftAgentWiseReport);

// Payroll -> Left & New Join Report
router.get('/join-left/department-wise', authenticate, joinLeftDepartmentWiseReport);
router.get('/join-left/agent-wise', authenticate, joinLeftAgentWiseReport);

// Payroll -> Attendance Report
router.get('/attendance/date-wise', authenticate, attendanceDateWiseReport);
router.get('/attendance/late-in', authenticate, attendanceLateInReport);
router.get('/attendance/manual-entry', authenticate, attendanceManualEntryReport);
router.get('/attendance/mis-match', authenticate, attendanceMisMatchReport);
router.get('/attendance/mispunch-vs-manual', authenticate, attendanceMisPunchVsManualReport);
// Attendance Detail Report (rptAttendanceDetails) — one endpoint, ?groupBy=<reportType>
// selects the layout (dateWise / punchingDetails / misPunch / employeeWise /
// batchWise / batchWithDept / manualEntry / withOT / otDetails / abstract /
// shiftAbstract / employeeGroup); ?status= drives @Attn.
router.get('/attendance/details', authenticate, attendanceDetailsReport);
// Movement Detail Report (rptMovementDetails) — ?groupBy=movement|employeeWise
// picks the SP (sp_MovementDetails_GetAll / _GetByEmployee); ?OrderBy=0|1.
router.get('/movement-details', authenticate, movementDetailsReport);
// Attendance Over All (rptAttendanceOverAll) — ?groupBy=dayWise|monthWise|yearWise
// working-days cross-tab (sp_EmpAtten_OverAll_DayWise / sp_EmpAtten_OverAll).
router.get('/attendance-overall', authenticate, attendanceOverAllReport);
// Leave Details Report (rptLeaveDetails) — sp_Employee_Attendance @Attn=7, summary
// + per-employee detail; ?leaveAbove=<n> keeps employees over that leave count.
router.get('/leave-details', authenticate, leaveDetailsReport);
// Attendance Details GOTS (frmAttendanceDetails_GOTS) — ?groupBy=dateWise|misPunch;
// dateWise → sp_Employee_Attendance_GOTS (Shift×Status matrix + detail),
// misPunch → sp_Employee_Attendance @Attn=9. ?status= drives @Attn for dateWise.
router.get('/attendance/details-gots', authenticate, attendanceDetailsGOTSReport);

// Payroll -> Strength Report
router.get('/strength/abstract', authenticate, strengthAbstractReport);

// Payroll -> Costing Report
router.get('/costing/abstract', authenticate, payrollCostingReport);

// Payroll -> Time Card (rptTimeCard) — per-employee attendance time card,
// sp_Employee_Attendance_GOTS @Attn=8; date range supplies @FromDate/@ToDate.
router.get('/time-card', authenticate, timeCardReport);

// Payroll -> Muster Report (rptMuster) — sp_Muster + sp_Muster_Title; one endpoint,
// ?reportBy=0..11 picks the layout (muster grid / OT / summary / engagement).
router.get('/muster', authenticate, musterReport);
// Filter-rail lookup lists for the Muster Report screen (rptMuster.vb Bind_Data).
router.get('/muster/options', authenticate, musterReportOptions);

// Payroll -> Muster Report ALL (rptMusterAll) — regenerates (sp_Muster_Generate_All)
// then sp_Muster_All + sp_Muster_Title_All; date-range driven, ?reportBy=0..3.
router.get('/muster-all', authenticate, musterAllReport);
router.get('/muster-all/options', authenticate, musterAllReportOptions);

// Payroll -> Form 25 (rptForm25) — sp_Muster1 + sp_Muster_ShiftNo_Title;
// statutory "FORM NO. 25" Muster Roll register, pay-period driven.
router.get('/form25', authenticate, form25Report);
router.get('/form25/options', authenticate, form25ReportOptions);

// Payroll -> Monthly Salary Details (rptMonthlySalaryDetails) — sp_Salary_GetAll;
// pay-period driven; ?reportType/reportName/reportFile pick the layout.
router.get('/monthly-salary', authenticate, monthlySalaryReport);
router.get('/monthly-salary/options', authenticate, monthlySalaryReportOptions);

export default router;
