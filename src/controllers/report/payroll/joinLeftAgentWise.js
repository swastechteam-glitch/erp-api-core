// New Joining & Left - Agent Wise (combined).
// Mirrors rptEmployeeJoinLeftDetails_AgentWise.rdlc — three side-by-side
// per-agent head-count summaries: NEW JOIN, LEFT and REJOIN.
//
// SPs: sp_Employee_NewJoining, sp_Employee_Left, sp_Employee_Rejoin (FromDate, ToDate)

import {
  runMultiEmployeeReport, buildEmployeePage, countSummaryColumn, str
} from './_common.js';

const TITLE = 'New Joining & Left - Agent Wise';
const FILE_NAME = 'NewJoiningAndLeft_AgentWise';

const agentBlock = (rows, sectionTitle) => countSummaryColumn(rows, {
  groupBy: (r) => r.AgentCode,
  groupLabel: (r) => str(r, 'AgentName') || '(No Agent)',
  groupHeader: 'AGENT',
  sectionTitle
});

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate }) {
  const columns = [
    agentBlock(data.newJoin || [], 'NEW JOIN'),
    agentBlock(data.left || [], 'LEFT'),
    agentBlock(data.rejoin || [], 'REJOIN')
  ];

  return buildEmployeePage({
    companyName, companyLogo, title: TITLE, orientation: 'landscape',
    fromDate, toDate, tables: [{ columns, columnGap: 10 }]
  });
}

export const joinLeftAgentWiseReport = (req, res) =>
  runMultiEmployeeReport(req, res, {
    fileName: FILE_NAME,
    procs: [
      { key: 'newJoin', spName: 'sp_Employee_NewJoining' },
      { key: 'left', spName: 'sp_Employee_Left' },
      { key: 'rejoin', spName: 'sp_Employee_Rejoin' }
    ],
    buildDocDefinition
  });
