// New Joining - Agent Wise.
// Mirrors rptEmployeeJoiningDetails_AgentWise.rdlc — a per-agent head-count
// summary page followed by the agent-grouped joining detail.
//
// SP: sp_Employee_NewJoining (FromDate, ToDate)

import {
  runNewJoiningReport, buildEmployeePage, countSummaryTable, countChart, groupedTable,
  str, dec, fmt, ddmmyyyy
} from './_common.js';

const TITLE = 'New Joining - Agent Wise';
const FILE_NAME = 'NewJoining_AgentWise';

const byEmpId = (a, b) =>
  (parseInt(a.EmployeeID) || 0) - (parseInt(b.EmployeeID) || 0) ||
  String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''));

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const summary = countSummaryTable(rows, {
    groupBy: (r) => r.AgentCode,
    groupLabel: (r) => str(r, 'AgentName') || '(No Agent)',
    groupHeader: 'AGENT'
  });

  const chart = countChart(rows, {
    groupBy: (r) => r.AgentCode,
    groupLabel: (r) => str(r, 'AgentName') || '(No Agent)',
    groupHeader: 'Agent'
  });

  const cols = [
    { header: 'Emp.ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'Employee Group', width: 75, value: (r) => str(r, 'EmpGroupName') },
    { header: 'Department', width: 90, value: (r) => str(r, 'DepartmentName') },
    { header: 'Designation', width: 80, value: (r) => str(r, 'DesignationName') },
    { header: 'Date Of Joining', width: 62, align: 'center', value: (r) => ddmmyyyy(r.DateOfJoining) },
    { header: 'Salary', width: 55, align: 'right', value: (r) => { const s = dec(r, 'Salary'); return s ? fmt(s, 0) : ''; } }
  ];

  const detail = groupedTable(cols, rows, {
    groupBy: (r) => r.AgentCode,
    groupLabel: (r, grp) => `${str(r, 'AgentName') || '(No Agent)'} (${grp.length})`,
    sortRows: byEmpId
  });
  detail.pageBreak = 'before';

  return buildEmployeePage({
    companyName, companyLogo, title: TITLE, orientation: 'portrait',
    fromDate, toDate, tables: [summary, ...chart, detail]
  });
}

export const newJoiningAgentWiseReport = (req, res) =>
  runNewJoiningReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
