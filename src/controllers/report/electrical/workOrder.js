// Electrical — Work Order reports.
// Identical to the Mechanical Work Order RDLCs (sp_WorkOrder_GetAll), so the
// builders are re-exported from ../mechanical/workOrder.js. Keeps the
// Electrical module self-contained.

export {
  workOrderDateWise,
  workOrderDepartmentWise,
  workOrderDetailsMachineWise,
  workOrderDetailsDepartmentWise,
  workOrderDetailsServiceWise,
  workOrderDetailsMachineWiseBreakDown
} from '../mechanical/workOrder.js';
