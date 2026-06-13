// Employee Register - Department Wise.
// Mirrors rptEmployeeRegister_DepartmentWise.rdlc — employees grouped by
// department, one row per employee.
//
// SP: sp_Employee_GetAll_Photo

import {
  runEmployeeReport, buildEmployeePage, groupedTable, str, dec, fmt, ddmmyyyy
} from './_common.js';

const TITLE = 'Employee Register Department Wise';
const FILE_NAME = 'EmployeeRegister_DepartmentWise';

const byEmpId = (a, b) =>
  (parseInt(a.EmployeeID) || 0) - (parseInt(b.EmployeeID) || 0) ||
  String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''));

function buildDocDefinition({ rows, companyName, companyLogo }) {
  const cols = [
    { header: 'Emp. ID', width: 40, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'DOJ', width: 56, align: 'center', value: (r) => ddmmyyyy(r.DateOfJoining) },
    { header: 'Agent', width: 90, value: (r) => str(r, 'AgentName') },
    { header: 'Batch Name', width: 84, value: (r) => str(r, 'EmployeeBatchName') },
    { header: 'Designation', width: 90, value: (r) => str(r, 'DesignationName') },
    { header: 'Hostel', width: 70, value: (r) => str(r, 'HostelTypeName') },
    { header: 'Grade', width: 60, value: (r) => str(r, 'GradeName') },
    { header: 'Wages', width: 56, align: 'right', value: (r) => { const s = dec(r, 'Salary'); return s ? fmt(s, 0) : ''; } },
    { header: 'Mess', width: 34, align: 'center', value: (r) => (r.MessAllowance === true || r.MessAllowance === 1 ? 'Y' : 'N') }
  ];

  const table = groupedTable(cols, rows, {
    groupBy: (r) => r.DepartmentCode,
    groupLabel: (r) => str(r, 'DepartmentName'),
    sortRows: byEmpId
  });

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'landscape', tables: [table] });
}

export const employeeRegisterDepartmentWiseReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
