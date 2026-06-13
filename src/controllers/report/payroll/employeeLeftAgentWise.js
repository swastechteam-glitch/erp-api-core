// Employee Left Details - Agent Wise.
// Mirrors rptEmployeeLeftDetails_AgentWise.rdlc — a per-agent head-count
// summary page followed by the agent-grouped left-employee detail.
//
// SP: sp_Employee_Left (FromDate, ToDate)

import {
  runNewJoiningReport, buildEmployeePage, countSummaryTable, countChart, groupedTable,
  str, dec, ddmmyyyy
} from './_common.js';

const TITLE = 'Left Details - Agent Wise';
const FILE_NAME = 'EmployeeLeftDetails_AgentWise';

const totWDays = (r) => (r.TotWDays == null || r.TotWDays === '' ? '0' : String(Math.round(dec(r, 'TotWDays'))));

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
    { header: 'Emp. ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'Employee Group', width: 70, value: (r) => str(r, 'EmpGroupName') },
    { header: 'Department', width: 85, value: (r) => str(r, 'DepartmentName') },
    { header: 'Designation', width: 80, value: (r) => str(r, 'DesignationName') },
    { header: 'Date of Join', width: 55, align: 'center', value: (r) => ddmmyyyy(r.DateOfJoining) },
    { header: 'Date of Left', width: 55, align: 'center', value: (r) => ddmmyyyy(r.DOL) },
    { header: 'Total W.Days', width: 45, align: 'center', value: totWDays }
  ];

  const detail = groupedTable(cols, rows, {
    groupBy: (r) => r.AgentCode,
    groupLabel: (r, grp) => `${str(r, 'AgentName') || '(No Agent)'} (${grp.length})`,
    serialPerGroup: true
  });
  detail.pageBreak = 'before';

  return buildEmployeePage({
    companyName, companyLogo, title: TITLE, orientation: 'portrait',
    fromDate, toDate, tables: [summary, ...chart, detail]
  });
}

export const employeeLeftAgentWiseReport = (req, res) =>
  runNewJoiningReport(req, res, { fileName: FILE_NAME, buildDocDefinition, spName: 'sp_Employee_Left' });
