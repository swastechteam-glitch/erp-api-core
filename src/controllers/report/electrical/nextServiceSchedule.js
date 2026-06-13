// Electrical — Next Service Schedule reports.
// Identical to the Mechanical Next Service Schedule RDLCs
// (sp_MachineDetails_ServiceSchedule_GetAll), so the builders are re-exported
// from ../mechanical/nextServiceSchedule.js. Keeps the Electrical module
// self-contained.

export {
  nextServiceMachineWise,
  nextServiceDepartmentWise,
  nextServiceServiceWise,
  nextServiceDateWise
} from '../mechanical/nextServiceSchedule.js';
