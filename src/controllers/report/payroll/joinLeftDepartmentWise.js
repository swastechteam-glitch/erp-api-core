// New Joining & Left - Department Wise (combined).
// Mirrors rptEmployeeJoinLeftDetails_DepartmentWie.rdlc — two side-by-side
// per-department head-count summaries: NEW JOIN and LEFT.
//
// SPs: sp_Employee_NewJoining, sp_Employee_Left (FromDate, ToDate)

import {
  runMultiEmployeeReport, buildEmployeePage, countSummaryColumn, str
} from './_common.js';

const TITLE = 'New Joining & Left - Department Wise';
const FILE_NAME = 'NewJoiningAndLeft_DepartmentWise';

const deptBlock = (rows, sectionTitle) => countSummaryColumn(rows, {
  groupBy: (r) => r.DepartmentCode,
  groupLabel: (r) => str(r, 'DepartmentName'),
  groupHeader: 'DEPARTMENT',
  sectionTitle
});

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate }) {
  const columns = [
    deptBlock(data.newJoin || [], 'NEW JOIN'),
    deptBlock(data.left || [], 'LEFT')
  ];

  return buildEmployeePage({
    companyName, companyLogo, title: TITLE, orientation: 'portrait',
    fromDate, toDate, tables: [{ columns, columnGap: 12 }]
  });
}

export const joinLeftDepartmentWiseReport = (req, res) =>
  runMultiEmployeeReport(req, res, {
    fileName: FILE_NAME,
    procs: [
      { key: 'newJoin', spName: 'sp_Employee_NewJoining' },
      { key: 'left', spName: 'sp_Employee_Left' }
    ],
    buildDocDefinition
  });
