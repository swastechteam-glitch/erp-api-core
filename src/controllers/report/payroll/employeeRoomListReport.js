// Employee Room List.
// Mirrors rptEmployeeRoomListReport.rdlc — employees grouped by Hostel
// ("Hostel Name : …"), sorted by Room No, one row per employee.
//
// SP: sp_Employee_GetAll_Photo

import {
  runEmployeeReport, buildEmployeePage, groupedTable, str
} from './_common.js';

const TITLE = 'Employee Room List Report';
const FILE_NAME = 'EmployeeRoomList';

// Within a hostel, order by Room No (natural), then Emp ID.
const byRoomEmp = (a, b) =>
  String(a.RoomNo ?? '').localeCompare(String(b.RoomNo ?? ''), undefined, { numeric: true }) ||
  (parseInt(a.EmployeeID) || 0) - (parseInt(b.EmployeeID) || 0);

function buildDocDefinition({ rows, companyName, companyLogo }) {
  const cols = [
    { header: 'R.No.', width: 44, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'Room No', width: 70, align: 'center', value: (r) => str(r, 'RoomNo') },
    { header: 'Shift Name', width: 100, value: (r) => str(r, 'ShiftName') },
    { header: 'Agent Name', width: 110, value: (r) => str(r, 'AgentName') },
    { header: 'Department Name', width: 120, value: (r) => str(r, 'DepartmentName') },
  ];

  const table = groupedTable(cols, rows, {
    groupBy: (r) => r.HostelTypeCode,
    groupLabel: (r) => `Hostel Name : ${str(r, 'HostelTypeName')}`,
    sortRows: byRoomEmp,
    groupFooter: true,
  });

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'portrait', tables: [table] });
}

export const employeeRoomListReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
