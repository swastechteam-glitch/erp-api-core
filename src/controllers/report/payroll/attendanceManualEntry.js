// Attendance Details - Manual Entry.
// Mirrors rptAttendanceDetails_ManualEntry.rdlc — attendance rows grouped under
// each calendar date, highlighting manual (EntryMode = 1) punches.
//
// SP: sp_Employee_Attendance (FromDate, ToDate, Attn, Emp_Status)

import {
  runAttendanceReport, buildEmployeePage, groupedTable, str, dec, hhmm, ddmmyyyy
} from './_common.js';

const TITLE = 'Attendance Details - Manual Entry';
const FILE_NAME = 'AttendanceDetails_ManualEntry';

const sts = (r) => Number(dec(r, 'Status_Number')).toFixed(2);
const inOut = (r, f) => {
  const v = r[f];
  if ((v === null || v === undefined) && str(r, 'Status') === 'P') return 'NP';
  return hhmm(v);
};

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const cols = [
    { header: 'Shift', width: 70, value: (r) => str(r, 'ShiftName') },
    { header: 'ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'Actual In / Out Time', width: 120, value: (r) => str(r, 'TimeLog') },
    { header: 'In Time', width: 52, align: 'center', value: (r) => inOut(r, 'InTime') },
    { header: 'Out Time', width: 52, align: 'center', value: (r) => inOut(r, 'OutTime') },
    { header: 'Late In', width: 45, align: 'center', value: (r) => str(r, 'Late_In') },
    { header: 'Early Out', width: 48, align: 'center', value: (r) => str(r, 'Early_Out') },
    { header: 'W. Hours', width: 48, align: 'center', value: (r) => str(r, 'Working_Hours') },
    { header: 'OT Hours', width: 48, align: 'center', value: (r) => str(r, 'OT_Hours') },
    { header: 'Sts', width: 36, align: 'right', value: sts }
  ];

  const table = groupedTable(cols, rows, {
    groupBy: (r) => (r.CalendarDate ? new Date(r.CalendarDate).toISOString().slice(0, 10) : ''),
    groupLabel: (r) => `Date : ${ddmmyyyy(r.CalendarDate)}`
  });

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'landscape', fromDate, toDate, tables: [table] });
}

export const attendanceManualEntryReport = (req, res) =>
  runAttendanceReport(req, res, { fileName: FILE_NAME, buildDocDefinition, defaultAttn: 5 });
