// Electrical — Service Schedule reports.
// The Electrical Service Schedule RDLCs are identical to the Mechanical ones
// (same stored procedures, same layout), so the report builders live once in
// ../mechanical/serviceSchedule.js and are re-exported here. This keeps the
// Electrical module self-contained (its routes import only from this folder)
// while avoiding duplicated logic. If Electrical later needs its own
// filtering (e.g. an Electrical maintenance type), give these wrappers their
// own spParams instead of re-exporting.

export {
  serviceScheduleDateWise,
  serviceScheduleMachineWise,
  serviceScheduleDepartmentWise,
  serviceScheduleServiceWise,
  scheduleTonnage,
  schedulePendings,
  schedulePendingsWithReason,
  scheduleCost
} from '../mechanical/serviceSchedule.js';
