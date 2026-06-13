// Attendance Details - Mis Match Punch.
// Mirrors rptAttendanceDetails_MisMatch.rdlc — attendance rows (mismatched
// punches) grouped under each calendar date.
//
// SP: sp_Employee_Attendance (FromDate, ToDate, Attn, Emp_Status)

import {
  runAttendanceReport, buildEmployeePage, groupedTable, str, ddmmyyyy
} from './_common.js';

const TITLE = 'Attendance Details - Mis Match Punch';
const FILE_NAME = 'AttendanceDetails_MisMatch';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const cols = [
    { header: 'ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: 150, value: (r) => str(r, 'EmployeeName') },
    { header: 'Department', width: 110, value: (r) => str(r, 'DepartmentName') },
    { header: 'In / Out Time', width: '*', value: (r) => str(r, 'TimeLog') }
  ];

  const table = groupedTable(cols, rows, {
    groupBy: (r) => (r.CalendarDate ? new Date(r.CalendarDate).toISOString().slice(0, 10) : ''),
    groupLabel: (r) => `Date : ${ddmmyyyy(r.CalendarDate)}`,
    groupFooter: true
  });

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'portrait', fromDate, toDate, tables: [table] });
}

export const attendanceMisMatchReport = (req, res) =>
  runAttendanceReport(req, res, { fileName: FILE_NAME, buildDocDefinition, defaultAttn: 9 });
