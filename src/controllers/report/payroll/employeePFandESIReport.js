// Employee PF and ESI Register.
// Mirrors rptEmployeePFandESI.rdlc — a flat register of each employee's
// statutory numbers (PF / UAN / ESI).
//
// SP: sp_Employee_GetAll_Photo

import {
  runEmployeeReport, buildEmployeePage, flatTable, str
} from './_common.js';

const TITLE = 'PF and ESI Register';
const FILE_NAME = 'EmployeePFandESI';

const byEmpId = (a, b) =>
  (parseInt(a.EmployeeID) || 0) - (parseInt(b.EmployeeID) || 0) ||
  String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''));

function buildDocDefinition({ rows, companyName, companyLogo }) {
  const cols = [
    { header: 'Emp. ID', width: 60, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'PF No', width: 120, value: (r) => str(r, 'PFNo') },
    { header: 'UAN No', width: 120, value: (r) => str(r, 'TANNo') },
    { header: 'ESI No', width: 120, value: (r) => str(r, 'ESINo') },
  ];

  const sorted = [...rows].sort(byEmpId);
  const table = flatTable(cols, sorted);

  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'portrait', tables: [table] });
}

export const employeePFandESIReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
