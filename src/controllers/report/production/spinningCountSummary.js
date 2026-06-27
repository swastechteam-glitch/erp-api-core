// Spinning Count Wise Summary report.
// Mirrors rptSpinningProductionCountSummary_Arun.rdlc — production grouped by
// count + mixing (same shape as the Day/Count wise summary).
//
// SP: sp_Prodn_SpinningProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import { runReport } from '../cotton/_common.js';
import { buildCountMixingDoc } from './spinningSummary.js';

const TITLE = 'SPINNING COUNT WISE SUMMARY REPORT';
const FILE_NAME = 'SpinningProduction_CountWiseSummary';

export const spinningCountSummaryReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_SpinningProdnDetails_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition: (ctx) => buildCountMixingDoc({ ...ctx, title: TITLE })
  });
};
