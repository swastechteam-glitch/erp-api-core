// Spinning Count Wise (Upto-Date) Production report.
// Mirrors 04rptSpinningProductionCountWise.rdlc — production grouped by count + mixing.
// Reuses the count/mixing aggregation from spinningSummary.js.
//
// SP: sp_Prodn_SpinningProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import { runReport } from '../cotton/_common.js';
import { buildCountMixingDoc } from './spinningSummary.js';

const TITLE = 'SPINNING COUNT WISE PRODUCTION REPORT';
const FILE_NAME = 'SpinningProduction_CountWise';

export const spinningCountWiseReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_SpinningProdnDetails_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition: (ctx) => buildCountMixingDoc({ ...ctx, title: TITLE })
  });
};
