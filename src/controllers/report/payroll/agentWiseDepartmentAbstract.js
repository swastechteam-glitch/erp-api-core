// Agent Wise Department Abstract.
// Mirrors rptAgentWiseDepartmentAbstract.rdlc — cross-tab of department (rows)
// × agent (columns), each cell the employee head-count, with row/column TOTALs.
//
// SP: sp_Employee_GetAll_Photo

import {
  runEmployeeReport, buildEmployeePage, buildMatrix, str
} from './_common.js';

const TITLE = 'Agent Wise Department Abstract';
const FILE_NAME = 'AgentWiseDepartmentAbstract';

function buildDocDefinition({ rows, companyName, companyLogo }) {
  const table = buildMatrix(rows, {
    rowKeyFn: (r) => r.DepartmentCode,
    rowLabelFn: (r) => str(r, 'DepartmentName'),
    colKeyFn: (r) => r.AgentCode,
    colLabelFn: (r) => str(r, 'AgentName') || '(No Agent)',
    cornerText: 'DEPARTMENT \\ AGENT'
  });

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'landscape', tables: [table] });
}

export const agentWiseDepartmentAbstractReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
