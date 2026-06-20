// Employee Adolescent Report.
// Mirrors rptEmployeeAdolesentReport.rdlc — flat employee listing with age and
// adolescent-certificate columns. The certificate columns have no backing field
// in the SP and are left blank, matching the .rdlc.
//
// SP: sp_Employee_GetAll_Photo

import {
  runEmployeeReport, buildEmployeePage, flatTable, str, ddmmyyyy
} from './_common.js';

const TITLE = 'Employee Adolescent Report';
const FILE_NAME = 'EmployeeAdolescentReport';

const byEmpId = (a, b) =>
  (parseInt(a.EmployeeID) || 0) - (parseInt(b.EmployeeID) || 0) ||
  String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''));

function buildDocDefinition({ rows, companyName, companyLogo }) {
  const cols = [
    { header: 'Tno', width: 36, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'Father Name', width: 70, value: (r) => str(r, 'FatherName') },
    { header: 'DOJ', width: 46, align: 'center', value: (r) => ddmmyyyy(r.DateOfJoining) },
    { header: 'DOB', width: 46, align: 'center', value: (r) => ddmmyyyy(r.DateOfBirth) },
    { header: 'Age', width: 28, align: 'center', value: (r) => str(r, 'Age') },
    { header: 'Cer.Req', width: 30, align: 'center', value: () => '' },
    { header: 'Certifi. No', width: 48, align: 'center', value: () => '' },
    { header: 'Certificate Date', width: 48, align: 'center', value: () => '' },
    { header: 'Certificate Renewal', width: 48, align: 'center', value: () => '' }
  ];

  const table = flatTable(cols, [...rows].sort(byEmpId));
  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'portrait', tables: [table] });
}

export const employeeAdolescentReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
