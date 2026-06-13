// Employee Agent Wise Report.
// Mirrors rptEmployeeAgentWiseReport.rdlc — employees grouped by agent with a
// per-agent "Total <count>" footer.
//
// SP: sp_Employee_GetAll_Photo

import {
  runEmployeeReport, buildEmployeePage, groupedTable, str, ddmmyyyy
} from './_common.js';

const TITLE = 'Employee Agent Wise Report';
const FILE_NAME = 'EmployeeAgentWiseReport';

const byEmpId = (a, b) =>
  (parseInt(a.EmployeeID) || 0) - (parseInt(b.EmployeeID) || 0) ||
  String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''));

function buildDocDefinition({ rows, companyName, companyLogo }) {
  const cols = [
    { header: 'R.No', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'DOJ', width: 60, align: 'center', value: (r) => ddmmyyyy(r.DateOfJoining) },
    { header: 'Department', width: 110, value: (r) => str(r, 'DepartmentName') },
    { header: 'Grade', width: 85, value: (r) => str(r, 'GradeName') },
    { header: 'Hostel Name', width: 90, value: (r) => str(r, 'HostelTypeName') }
  ];

  const table = groupedTable(cols, rows, {
    groupBy: (r) => r.AgentCode,
    groupLabel: (r) => str(r, 'AgentName'),
    groupFooter: true,
    sortRows: byEmpId
  });

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'portrait', tables: [table] });
}

export const employeeAgentWiseReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
