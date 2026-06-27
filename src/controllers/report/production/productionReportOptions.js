// GET /production/reports/overall/options
// Lookup lists for the Production All Department report screen's left filter
// panel — Branch / Supervisor / Department / Machine / Count / Stop. Reason.
// Each lookup is independently guarded so one failing source can't sink the
// rest (mirrors wasteStockOptions). Field/source names match the existing
// master + dropdown controllers.

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';

const safe = async (fn) => {
  try { return await fn(); } catch (e) { console.warn('productionReportOptions:', e.message); return []; }
};

export const productionReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ success: false, message: 'Missing subDBName header' });
    const pool = await getPool(subDbName);
    const companyCode = parseInt(req.query.CompanyCode) || 0;

    const [branches, departments, machines, counts, stoppageReasons, supervisors] = await Promise.all([
      // Branch (tbl_Branch, per company).
      safe(async () => {
        const r = await pool.request().input('CompanyCode', sql.Int, companyCode)
          .query('SELECT BranchCode, BranchName FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName');
        return r.recordset.map((b) => ({ value: b.BranchCode, label: b.BranchName }));
      }),
      // Department (vw_Department).
      safe(async () => {
        const r = await pool.request()
          .query('SELECT DepartmentCode, DepartmentName FROM vw_Department ORDER BY OrderNo');
        return r.recordset.map((d) => ({ value: d.DepartmentCode, label: d.DepartmentName }));
      }),
      // Machine (vw_Machine, active, excluding motors — same filter as /machine/lists).
      safe(async () => {
        const r = await pool.request().query(
          "SELECT MachineCode, MachineName FROM vw_Machine WHERE Status = 1 AND MachineTypeName NOT LIKE '%MOTOR%' ORDER BY MachineName"
        );
        return r.recordset.map((m) => ({ value: m.MachineCode, label: m.MachineName }));
      }),
      // Count (tbl_CountName).
      safe(async () => {
        const r = await pool.request().query('SELECT CountNameCode, CountName FROM tbl_CountName ORDER BY CountName');
        return r.recordset.map((c) => ({ value: c.CountNameCode, label: c.CountName }));
      }),
      // Stoppage reason (sp_StoppageReason_GetAll).
      safe(async () => {
        const r = await pool.request().execute('sp_StoppageReason_GetAll');
        return r.recordset.map((s) => ({ value: s.StoppageReasonCode, label: s.StoppageReason }));
      }),
      // Supervisor (sp_Supervisor_GetAll @CompanyCode, @Status).
      safe(async () => {
        const r = await pool.request()
          .input('CompanyCode', sql.Int, companyCode)
          .input('Status', sql.Int, 1)
          .execute('sp_Supervisor_GetAll');
        return r.recordset.map((s) => ({ value: s.SupervisorCode, label: s.SupervisorName }));
      }),
    ]);

    return res.json({
      success: true,
      data: { branches, supervisors, departments, machines, counts, stoppageReasons },
    });
  } catch (err) {
    console.error('DB Error (productionReportOptions):', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
