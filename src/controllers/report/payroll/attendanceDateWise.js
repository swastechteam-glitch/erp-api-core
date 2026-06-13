// Attendance Details - Date Wise.
// Mirrors rptAttendanceDetails_DateWise.rdlc — attendance rows grouped under
// each calendar date.
//
// SP: sp_Employee_Attendance (FromDate, ToDate, Attn, Emp_Status)

import {
  runAttendanceReport, buildEmployeePage, groupedTable, str, dec, ddmmyyyy
} from './_common.js';

const TITLE = 'Attendance Details';
const FILE_NAME = 'AttendanceDetails_DateWise';

const sts = (r) => Number(dec(r, 'Status_Number')).toFixed(2);

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const cols = [
    { header: 'ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'Department', width: 90, value: (r) => str(r, 'DepartmentName') },
    { header: 'Shift', width: 70, value: (r) => str(r, 'ShiftName') },
    { header: 'Attn. Timings', width: 120, value: (r) => str(r, 'TimeLog') },
    { header: 'Tot.Wrk.Hrs', width: 56, align: 'center', value: (r) => str(r, 'TotalWorking_Hours') },
    { header: 'OT Hrs', width: 45, align: 'center', value: (r) => { const v = dec(r, 'OT_Hours'); return v ? str(r, 'OT_Hours') : ''; } },
    { header: 'Brk. Hrs', width: 45, align: 'center', value: (r) => str(r, 'Break_Duration') },
    { header: 'Sts', width: 38, align: 'right', value: sts }
  ];

  const table = groupedTable(cols, rows, {
    groupBy: (r) => (r.CalendarDate ? new Date(r.CalendarDate).toISOString().slice(0, 10) : ''),
    groupLabel: (r) => `Date : ${ddmmyyyy(r.CalendarDate)}`
  });

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'landscape', fromDate, toDate, tables: [table] });
}

export const attendanceDateWiseReport = (req, res) =>
  runAttendanceReport(req, res, { fileName: FILE_NAME, buildDocDefinition, defaultAttn: 5 });
