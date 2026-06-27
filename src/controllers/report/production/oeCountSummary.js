// OE Count Wise Summary report.
// Mirrors rptOEProductionCountSummary_Arun.rdlc — production grouped by
// count + mixing (same shape as the Day/Count wise summary).
//
// SP: sp_Prodn_OEProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import { runReport } from '../cotton/_common.js';
import { buildCountMixingDoc } from './oeSummary.js';

const TITLE = 'OE COUNT WISE SUMMARY REPORT';
const FILE_NAME = 'OEProduction_CountWiseSummary';

export const oeCountSummaryReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_OEProdnDetails_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition: (ctx) => buildCountMixingDoc({ ...ctx, title: TITLE })
  });
};
