// Electrical — Break Down reports.
// Identical to the Mechanical Break Down RDLCs (sp_BreakDown_GetAll +
// sp_ScheduleBreakDown_Cost), so the detail builders are re-exported from
// ../mechanical/breakDown.js. The cost report needs an Electrical ServiceType
// ('E'), so it is built from the shared factory instead of re-exported.

import { makeBreakDownCost } from '../mechanical/breakDown.js';

export {
  breakDownMachineWise,
  breakDownDepartmentWise,
  breakDownDateWise
} from '../mechanical/breakDown.js';

export const breakDownCost = makeBreakDownCost('E');
