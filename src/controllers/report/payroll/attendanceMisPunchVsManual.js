// Attendance Details - MISPUNCH v/s MANUAL ENTRY.
// Mirrors rptAttendanceDetails_MisMatchAndManualEntry.rdlc — compares the
// machine punch log against the manual in/out entry, grouped by calendar date.
//
// SP: sp_Employee_Attendance_MisPunch (FromDate, ToDate, Emp_Status)

import {
  runAttendanceReport, buildEmployeePage, groupedTable, str, dec, hhmm, ddmmyyyy
} from './_common.js';

const TITLE = 'Attendance Details - MISPUNCH v/s MANUAL ENTRY';
const FILE_NAME = 'AttendanceDetails_MisPunchVsManual';

const sts = (r) => Number(dec(r, 'Status_Number')).toFixed(2);
const manual = (r) => (dec(r, 'Status_Number') === 0 ? 'Leave' : `${hhmm(r.InTime)} - ${hhmm(r.OutTime)}`);

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const cols = [
    { header: 'Employee', width: '*', value: (r) => `${str(r, 'EmployeeID')} - ${str(r, 'EmployeeName')}` },
    { header: 'Machine', width: 150, value: (r) => str(r, 'TimeLog') },
    { header: 'Manual', width: 130, align: 'center', value: manual },
    { header: 'W. Hrs.', width: 50, align: 'center', value: (r) => str(r, 'Working_Hours') },
    { header: 'OT Hrs.', width: 50, align: 'center', value: (r) => str(r, 'OT_Hours') },
    { header: 'Sts', width: 40, align: 'right', value: sts }
  ];

  const table = groupedTable(cols, rows, {
    groupBy: (r) => (r.CalendarDate ? new Date(r.CalendarDate).toISOString().slice(0, 10) : ''),
    groupLabel: (r) => `Date : ${ddmmyyyy(r.CalendarDate)}`,
    groupFooter: true
  });

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'landscape', fromDate, toDate, tables: [table] });
}

export const attendanceMisPunchVsManualReport = (req, res) =>
  runAttendanceReport(req, res, { fileName: FILE_NAME, buildDocDefinition, spName: 'sp_Employee_Attendance_MisPunch' });
