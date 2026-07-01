// Employee Hostel Type Wise.
// Mirrors rptEmployeeHostelTypeWiseReport.rdlc — employees grouped by Hostel
// Type (with a "Hostel Type Wise Total" per group), one row per employee.
//
// SP: sp_Employee_GetAll_Photo

import {
  runEmployeeReport, buildEmployeePage, groupedTable, str
} from './_common.js';

const TITLE = 'Hostel Type Wise Report';
const FILE_NAME = 'EmployeeHostelTypeWise';

// Within a hostel type, order by department (OrderNo) then Emp ID.
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
    { header: 'Batch', width: 100, value: (r) => str(r, 'EmployeeBatchName') },
    { header: 'Room No', width: 60, align: 'center', value: (r) => str(r, 'RoomNo') },
  ];

  const table = groupedTable(cols, rows, {
    groupBy: (r) => r.HostelTypeCode,
    groupLabel: (r) => str(r, 'HostelTypeName'),
    sortRows: byDeptEmp,
    groupFooter: true,
  });

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'portrait', tables: [table] });
}

export const employeeHostelTypeWiseReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
