// Attendance Late In Details.
// Mirrors rptAttendanceDetailsLateIn.rdlc — late-in attendance rows grouped by
// employee group.
//
// SP: sp_Employee_Attendance (FromDate, ToDate, Attn, Emp_Status)

import {
  runAttendanceReport, buildEmployeePage, groupedTable, str, hhmm, ddmmyyyy
} from './_common.js';

const TITLE = 'Attendance Late In Details';
const FILE_NAME = 'AttendanceDetails_LateIn';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const cols = [
    { header: 'Date', width: 55, align: 'center', value: (r) => ddmmyyyy(r.CalendarDate) },
    { header: 'Shift', width: 70, value: (r) => str(r, 'ShiftName') },
    { header: 'Department', width: 90, value: (r) => str(r, 'DepartmentName_English') || str(r, 'DepartmentName') },
    { header: 'Designation', width: 90, value: (r) => str(r, 'DesignationName') },
    { header: 'ID', width: 42, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'In Time', width: 56, align: 'center', value: (r) => hhmm(r.InTime) },
    { header: 'Out Time', width: 56, align: 'center', value: (r) => hhmm(r.OutTime) },
    { header: 'Late In Hrs', width: 52, align: 'center', value: (r) => str(r, 'Late_In') },
    { header: 'W. Hours', width: 50, align: 'center', value: (r) => str(r, 'Working_Hours') },
    { header: 'OT Hours', width: 50, align: 'center', value: (r) => str(r, 'OT_Hours') }
  ];

  const table = groupedTable(cols, rows, {
    groupBy: (r) => str(r, 'EmpGroupName') || '(No Group)',
    groupLabel: (r) => str(r, 'EmpGroupName') || '(No Group)'
  });

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'landscape', fromDate, toDate, tables: [table] });
}

export const attendanceLateInReport = (req, res) =>
  runAttendanceReport(req, res, { fileName: FILE_NAME, buildDocDefinition, defaultAttn: 6 });
