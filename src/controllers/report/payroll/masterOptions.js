// Employee Master (rptEmployeeMaster) filter-rail lookup lists.
//
// GET /payroll/reports/master/options?CompanyCode=<n>
//
// One call returns every dropdown the screen needs, mirroring the
// cmb*.RecordSource queries in rptEmployeeMaster.vb (Bind_Data). Company-scoped
// lists (Branch, Employee) filter by the selected CompanyCode; the rest are
// global masters. Each list is returned as { Code, Name } so the React
// MultiSelect normalizer maps value=Code / label=Name directly.
//
// A single list failing (e.g. a view missing on an older DB) yields [] for that
// key instead of failing the whole request — the screen still opens.

import { getPool } from '../../../config/dynamicDB.js';

export const employeeMasterOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).json({ success: false, error: 'Missing subDBName header' });
    }

    const companyCode =
      parseInt(req.query.CompanyCode || req.query.companyCode || req.headers.companycode) || 0;
    const pool = await getPool(subDbName);

    // Run a SELECT, coercing failures to [] so one bad lookup can't 500 the page.
    const q = (text) =>
      pool
        .request()
        .query(text)
        .then((r) => r.recordset || [])
        .catch((e) => {
          console.error('employeeMasterOptions query failed:', e.message);
          return [];
        });
    const map = (rows, codeKey, nameKey) =>
      rows.map((r) => ({ Code: r[codeKey], Name: r[nameKey] }));

    const [
      branches, empGroups, categories, departments, designations,
      grades, batches, hostelTypes, agents, banks, genders, employees,
    ] = await Promise.all([
      q(`SELECT BranchCode, BranchName FROM tbl_Branch WHERE CompanyCode = ${companyCode} ORDER BY BranchName`),
      q(`SELECT EmpGroupCode, EmpGroupName FROM tbl_EmpGroup ORDER BY EmpGroupName`),
      q(`SELECT EmpCategoryCode, EmpCategoryName FROM tbl_EmpCategory ORDER BY EmpCategoryName`),
      q(`SELECT DepartmentCode, DepartmentName FROM tbl_Department WHERE HR = 1 ORDER BY DepartmentName`),
      q(`SELECT DesignationCode, DesignationName FROM tbl_Designation ORDER BY DesignationName`),
      q(`SELECT GradeCode, GradeName FROM tbl_Grade ORDER BY GradeName`),
      q(`SELECT EmployeeBatchCode, EmployeeBatchName FROM tbl_EmployeeBatch ORDER BY EmployeeBatchName`),
      q(`SELECT HostelTypeCode, HostelTypeName FROM tbl_HostelType ORDER BY HostelTypeName`),
      q(`SELECT AgentCode, AgentName FROM tbl_Agent WHERE HR = 1 ORDER BY AgentName`),
      q(`SELECT BankCode, BankName FROM tbl_Bank ORDER BY BankName`),
      q(`SELECT SexCode, SexName FROM tbl_Sex ORDER BY SexName`),
      q(`SELECT EmployeeCode, str_EmployeeID FROM vw_Employee_New WHERE CompanyCode = ${companyCode} ORDER BY EmployeeID`),
    ]);

    return res.json({
      success: true,
      data: {
        branches: map(branches, 'BranchCode', 'BranchName'),
        empGroups: map(empGroups, 'EmpGroupCode', 'EmpGroupName'),
        categories: map(categories, 'EmpCategoryCode', 'EmpCategoryName'),
        departments: map(departments, 'DepartmentCode', 'DepartmentName'),
        designations: map(designations, 'DesignationCode', 'DesignationName'),
        grades: map(grades, 'GradeCode', 'GradeName'),
        batches: map(batches, 'EmployeeBatchCode', 'EmployeeBatchName'),
        hostelTypes: map(hostelTypes, 'HostelTypeCode', 'HostelTypeName'),
        agents: map(agents, 'AgentCode', 'AgentName'),
        banks: map(banks, 'BankCode', 'BankName'),
        genders: map(genders, 'SexCode', 'SexName'),
        employees: map(employees, 'EmployeeCode', 'str_EmployeeID'),
      },
    });
  } catch (err) {
    console.error('DB Error (employeeMasterOptions):', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
