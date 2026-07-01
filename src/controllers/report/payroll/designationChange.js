// Department / Designation Change Report.
// Mirrors rptDesignationChangeDetails.rdlc — a date-ranged log of the employees
// whose department / designation changed in the period, one row per change.
//
// SP: sp_DesignationChange_GetAll (@FromDate, @ToDate, @CompanyCode)

import {
  runDateRangeEmployeeReport, buildEmployeePage, flatTable, str, ddmmyyyy
} from './_common.js';

const TITLE = 'Department & Designation Change Report';
const FILE_NAME = 'DepartmentDesignationChange';

// mssql returns the stored wall-clock time as a UTC Date — use UTC getters so
// the printed "dd/MM/yyyy HH:mm" matches what was entered (no TZ shift). Mirrors
// the .rdlc's Format(ChangeDate, "dd/MM/yyyy  HH:mm").
const dateTime = (d) => {
  if (d === null || d === undefined || d === '') return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(dt.getUTCDate())}/${p(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()} ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}`;
};

const byEmpId = (a, b) =>
  (parseInt(a.EmployeeID) || 0) - (parseInt(b.EmployeeID) || 0) ||
  String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''));

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const cols = [
    { header: 'Date', width: 92, align: 'center', value: (r) => dateTime(r.ChangeDate) },
    { header: 'Emp. ID', width: 50, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'DOJ', width: 64, align: 'center', value: (r) => ddmmyyyy(r.DateofJoining) },
    { header: 'Designation', width: 110, value: (r) => str(r, 'DesignationName') },
    { header: 'Department', width: 110, value: (r) => str(r, 'DepartmentName') },
    { header: 'Employee Batch', width: 80, value: (r) => str(r, 'EmployeeBatchName') },
  ];

  const sorted = [...rows].sort(byEmpId);
  const table = flatTable(cols, sorted);

  return buildEmployeePage({
    companyName, companyLogo, title: TITLE, orientation: 'portrait',
    tables: [table], fromDate, toDate,
  });
}

export const designationChangeReport = (req, res) =>
  runDateRangeEmployeeReport(req, res, {
    fileName: FILE_NAME,
    buildDocDefinition,
    spName: 'sp_DesignationChange_GetAll',
  });
