// Electrical — Electrical (Maintenance) Daily Report.
// Same composite as the Mechanical Daily Report (rptMaintenanceDailyReport.rdlc,
// six daily SPs), so it reuses the shared factory from
// ../mechanical/mechanicalDailyReport.js. The only differences are the default
// ServiceType filter ('E' instead of 'M') and the download file name. A caller
// can still override the type via ?ServiceType=.

import { makeDailyReport } from '../mechanical/mechanicalDailyReport.js';

export const electricalDailyReport = makeDailyReport({
  fileName: 'ElectricalDailyReport',
  defaultServiceType: 'E'
});
