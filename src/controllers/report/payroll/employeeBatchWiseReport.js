// Employee Batch Wise.
// Mirrors rptEmployeeBatchWiseReport.rdlc — employees grouped by Employee Batch
// (with a "Batch Wise Total" per group), one row per employee.
//
// SP: sp_Employee_GetAll_Photo

import {
  runEmployeeReport, buildEmployeePage, groupedTable, str
} from './_common.js';

const TITLE = 'Employee Batch Wise Report';
const FILE_NAME = 'EmployeeBatchWise';

// Within a batch, order by department (OrderNo) then Emp ID — matches the
// .rdlc's Department sub-group + EmployeeID sort.
const byDeptEmp = (a, b) =>
  (parseInt(a.OrderNo) || 0) - (parseInt(b.OrderNo) || 0) ||
  (parseInt(a.EmployeeID) || 0) - (parseInt(b.EmployeeID) || 0) ||
  String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''));

function buildDocDefinition({ rows, companyName, companyLogo }) {
  const cols = [
    { header: 'R.No.', width: 44, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'Department', width: 120, value: (r) => str(r, 'DepartmentName') },
    { header: 'Agent', width: 110, value: (r) => str(r, 'AgentName') },
    { header: 'Hostel Name', width: 100, value: (r) => str(r, 'HostelTypeName') },
    { header: 'Room No', width: 60, align: 'center', value: (r) => str(r, 'RoomNo') },
  ];

  const table = groupedTable(cols, rows, {
    groupBy: (r) => r.EmployeeBatchCode,
    groupLabel: (r) => str(r, 'EmployeeBatchName'),
    sortRows: byDeptEmp,
    groupFooter: true,
  });

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'portrait', tables: [table] });
}

export const employeeBatchWiseReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
