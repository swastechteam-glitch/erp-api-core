// OE Count Wise (Upto-Date) Production report.
// Mirrors 04rptOEProductionCountWise.rdlc — production grouped by count + mixing.
// Reuses the count/mixing aggregation from oeSummary.js.
//
// SP: sp_Prodn_OEProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import { runReport } from '../cotton/_common.js';
import { buildCountMixingDoc } from './oeSummary.js';

const TITLE = 'OE COUNT WISE PRODUCTION REPORT';
const FILE_NAME = 'OEProduction_CountWise';

export const oeCountWiseReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_OEProdnDetails_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition: (ctx) => buildCountMixingDoc({ ...ctx, title: TITLE })
  });
};
