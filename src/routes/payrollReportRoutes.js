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

// Payroll -> Strength Report
import { strengthAbstractReport } from "../controllers/report/payroll/strengthAbstract.js";

// Payroll -> Costing Report
import { payrollCostingReport } from "../controllers/report/payroll/costingReport.js";

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

// Payroll -> Strength Report
router.get('/strength/abstract', authenticate, strengthAbstractReport);

// Payroll -> Costing Report
router.get('/costing/abstract', authenticate, payrollCostingReport);

export default router;
