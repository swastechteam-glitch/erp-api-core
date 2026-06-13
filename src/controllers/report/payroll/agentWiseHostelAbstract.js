// Agent Wise Hostel Abstract.
// Mirrors rptAgentWiseHostelAbstract.rdlc — cross-tab of agent (rows) × hostel
// type (columns), each cell the employee head-count, with row/column TOTALs.
//
// SP: sp_Employee_GetAll_Photo

import {
  runEmployeeReport, buildEmployeePage, buildMatrix, str
} from './_common.js';

const TITLE = 'Agent Wise Hostel Abstract';
const FILE_NAME = 'AgentWiseHostelAbstract';

function buildDocDefinition({ rows, companyName, companyLogo }) {
  const table = buildMatrix(rows, {
    rowKeyFn: (r) => r.AgentCode,
    rowLabelFn: (r) => str(r, 'AgentName') || '(No Agent)',
    colKeyFn: (r) => r.HostelTypeCode,
    colLabelFn: (r) => str(r, 'HostelTypeName') || '(None)',
    cornerText: 'AGENT \\ HOSTEL'
  });

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'portrait', tables: [table] });
}

export const agentWiseHostelAbstractReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
