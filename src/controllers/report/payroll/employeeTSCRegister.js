// Employee TSC Register (with photo).
// Mirrors rptEmployeeTSCRegister_WithPhoto.rdlc — one row per employee with a
// photo column on the right. Built manually (rather than via flatTable) because
// of the embedded image cell.
//
// SP: sp_Employee_GetAll_Photo

import {
  runEmployeeReport, buildEmployeePage, tableLayout, colors, headStyle,
  bufferToDataUri, str, ddmmyyyy
} from './_common.js';

const TITLE = 'Employee TSC Register';
const FILE_NAME = 'EmployeeTSCRegister';

const byEmpId = (a, b) =>
  (parseInt(a.EmployeeID) || 0) - (parseInt(b.EmployeeID) || 0) ||
  String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''));

const address = (r) => [r.Address1, r.Address2, r.City, r.District, r.PinCode]
  .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
  .filter(Boolean)
  .join(', ');

function buildDocDefinition({ rows, companyName, companyLogo }) {
  const widths = [22, 38, '*', 64, 50, 50, 50, 36, '*', '*', 52, 44, 48, 48, 56, 64, 46];
  const header = [
    'S.No', 'Emp. ID', 'Name', 'Department', 'DOB', 'Education', 'DOJ', 'Blood', 'Father Name',
    'Address', 'State', 'Pincode', 'Caste', 'Religion', 'Contact No.', 'Aadhar No.', 'Photo'
  ].map((t) => ({ text: t, ...headStyle, fontSize: 7 }));

  const body = [header];
  const sorted = [...rows].sort(byEmpId);

  sorted.forEach((r, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'left') => ({ text, alignment: align, fontSize: 7, fillColor: zebra });
    const photoUri = bufferToDataUri(r.Photo);
    const photoCell = photoUri
      ? { image: photoUri, fit: [40, 46], alignment: 'center', fillColor: zebra }
      : cell('', 'center');

    body.push([
      cell(String(i + 1), 'center'),
      cell(str(r, 'EmployeeID'), 'center'),
      cell(str(r, 'EmployeeName')),
      cell(str(r, 'DepartmentName')),
      cell(ddmmyyyy(r.DateOfBirth), 'center'),
      cell(str(r, 'Qualification'), 'center'),
      cell(ddmmyyyy(r.DateOfJoining), 'center'),
      cell(str(r, 'BloodGroup'), 'center'),
      cell(str(r, 'FatherName')),
      cell(address(r)),
      cell(str(r, 'StateName'), 'center'),
      cell(str(r, 'PinCode'), 'center'),
      cell(str(r, 'Community'), 'center'),
      cell('', 'center'),
      cell(str(r, 'PhoneNo'), 'center'),
      cell(str(r, 'AadharNo'), 'center'),
      photoCell
    ]);
  });

  return buildEmployeePage({
    companyName, companyLogo, title: TITLE, orientation: 'landscape',
    tables: [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }]
  });
}

export const employeeTSCRegisterReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
