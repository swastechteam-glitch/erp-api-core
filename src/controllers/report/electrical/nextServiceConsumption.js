// Electrical — Next Service Consumption reports.
// Identical to the Mechanical Next Service Consumption RDLCs
//   rptMaintenance_Consumption_ItemWise / _MachineWise / _DepartmentWise.rdlc
//       (sp_Maintenance_Consumption_GetAll)
//   rptMaintenance_LastMaintenanceDate_Consumption_ItemWise/MachineWise_New.rdlc
//       (sp_Schedule_BreakDownDetails_GetAll)
//   rptMaintenceItemStock.rdlc (sp_Store_Maintence_StockStatus)
// so the builders are re-exported from ../mechanical/nextServiceConsumption.js.
// Keeps the Electrical module self-contained.

export {
  consumptionItemWise,
  consumptionMachineWise,
  consumptionDepartmentWise,
  consumptionDateWise,
  lastConsumptionItemWise,
  lastConsumptionMachineWise,
  maintenanceItemStock
} from '../mechanical/nextServiceConsumption.js';
