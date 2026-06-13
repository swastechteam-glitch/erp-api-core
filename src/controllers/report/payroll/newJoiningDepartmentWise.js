// New Joining - Department Wise.
// Mirrors rptEmployeeJoiningDetails_DepartmentWise.rdlc — a per-department
// head-count summary page followed by the department-grouped joining detail.
//
// SP: sp_Employee_NewJoining (FromDate, ToDate)

import {
  runNewJoiningReport, buildEmployeePage, countSummaryTable, countChart, groupedTable,
  str, dec, fmt, ddmmyyyy
} from './_common.js';

const TITLE = 'New Joining - Department Wise';
const FILE_NAME = 'NewJoining_DepartmentWise';

const byOrderNo = (a, b) =>
  (parseInt(a.OrderNo) || 0) - (parseInt(b.OrderNo) || 0) ||
  (parseInt(a.EmployeeID) || 0) - (parseInt(b.EmployeeID) || 0);

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const summary = countSummaryTable(rows, {
    groupBy: (r) => r.DepartmentCode,
    groupLabel: (r) => str(r, 'DepartmentName'),
    groupHeader: 'DEPARTMENT'
  });

  const chart = countChart(rows, {
    groupBy: (r) => r.DepartmentCode,
    groupLabel: (r) => str(r, 'DepartmentName'),
    groupHeader: 'Department'
  });

  const cols = [
    { header: 'Emp.ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'Employee Group', width: 75, value: (r) => str(r, 'EmpGroupName') },
    { header: 'Designation', width: 90, value: (r) => str(r, 'DesignationName') },
    { header: 'Date Of Joining', width: 62, align: 'center', value: (r) => ddmmyyyy(r.DateOfJoining) },
    { header: 'Agent', width: 90, value: (r) => str(r, 'AgentName') },
    { header: 'Salary', width: 55, align: 'right', value: (r) => { const s = dec(r, 'Salary'); return s ? fmt(s, 0) : ''; } }
  ];

  const detail = groupedTable(cols, rows, {
    groupBy: (r) => r.DepartmentCode,
    groupLabel: (r, grp) => `${str(r, 'DepartmentName')} (${grp.length})`,
    sortRows: byOrderNo
  });
  detail.pageBreak = 'before';

  return buildEmployeePage({
    companyName, companyLogo, title: TITLE, orientation: 'portrait',
    fromDate, toDate, tables: [summary, ...chart, detail]
  });
}

export const newJoiningDepartmentWiseReport = (req, res) =>
  runNewJoiningReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
