// Employee Bank Account Register.
// Mirrors rptEmployeeBankAccountRegister.rdlc — flat employee listing of bank /
// statutory account details. UAN No. has no backing field in the SP and is left
// blank, matching the .rdlc.
//
// SP: sp_Employee_GetAll_Photo

import {
  runEmployeeReport, buildEmployeePage, flatTable, str
} from './_common.js';

const TITLE = 'Employee Bank Account Register';
const FILE_NAME = 'EmployeeBankAccountRegister';

const byEmpId = (a, b) =>
  (parseInt(a.EmployeeID) || 0) - (parseInt(b.EmployeeID) || 0) ||
  String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''));

function buildDocDefinition({ rows, companyName, companyLogo }) {
  const cols = [
    { header: 'Emp. ID', width: 32, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'Shift', width: 48, align: 'center', value: (r) => str(r, 'ShiftName') },
    { header: 'Agent', width: 70, value: (r) => str(r, 'AgentName') },
    { header: 'Bank Name', width: 72, value: (r) => str(r, 'BankName') },
    { header: 'A/C No.', width: 74, align: 'center', value: (r) => str(r, 'ACNo') },
    { header: 'IFSC Code', width: 60, align: 'center', value: (r) => str(r, 'IFSCCode') },
    { header: 'Aadhar No.', width: 72, align: 'center', value: (r) => str(r, 'AadharNo') },
    { header: 'PF No.', width: 62, align: 'center', value: (r) => str(r, 'PFNo') },
    { header: 'UAN No.', width: 54, align: 'center', value: () => '' },
    { header: 'ESI No.', width: 62, align: 'center', value: (r) => str(r, 'ESINo') },
    { header: 'PAN No.', width: 62, align: 'center', value: (r) => str(r, 'PANNo') },
    { header: 'Mobile No.', width: 64, align: 'center', value: (r) => str(r, 'PhoneNo') }
  ];

  const table = flatTable(cols, [...rows].sort(byEmpId));
  return buildEmployeePage({ companyName, companyLogo, title: TITLE, orientation: 'landscape', tables: [table] });
}

export const employeeBankAccountRegisterReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
