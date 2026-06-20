// Employee Proof Register.
// Mirrors rptEmployeeProofRegister.rdlc — flat employee listing with document
// columns. Several proof columns have no backing field in the SP (Family Card,
// Education Cert, Voter ID, Driving License) and are intentionally left blank,
// matching the .rdlc.
//
// SP: sp_Employee_GetAll_Photo

import {
  runEmployeeReport, buildEmployeePage, flatTable, str
} from './_common.js';

const TITLE = 'Employee Proof Register';
const FILE_NAME = 'EmployeeProofRegister';

const byEmpId = (a, b) =>
  (parseInt(a.EmployeeID) || 0) - (parseInt(b.EmployeeID) || 0) ||
  String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''));

function buildDocDefinition({ rows, companyName, companyLogo }) {
  const cols = [
    { header: 'Emp. ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'Village', width: 80, value: (r) => str(r, 'City') },
    { header: 'District', width: 80, value: (r) => str(r, 'District') },
    { header: 'Family Card No.', width: 80, align: 'center', value: () => '' },
    { header: 'Aadhar Card No.', width: 88, align: 'center', value: (r) => str(r, 'AadharNo') },
    { header: 'Edu. Cert. No.', width: 80, align: 'center', value: () => '' },
    { header: 'Voter ID No.', width: 80, align: 'center', value: () => '' },
    { header: 'Driving License No.', width: 82, align: 'center', value: () => '' }
  ];

  const table = flatTable(cols, [...rows].sort(byEmpId));
  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'landscape', tables: [table] });
}

export const employeeProofRegisterReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
