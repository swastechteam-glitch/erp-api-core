import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { cardingProductionSummaryReport } from "../controllers/report/production/cardingSummary.js";
import { cardingMachineWiseReport } from "../controllers/report/production/cardingMachineWise.js";
import { cardingStoppageReport } from "../controllers/report/production/cardingStoppage.js";
import { cardingShiftWiseReport } from "../controllers/report/production/cardingShiftWise.js";
import { cardingShiftWiseDetailsReport } from "../controllers/report/production/cardingShiftWiseDetails.js";
import { cardingMixWiseReport } from "../controllers/report/production/cardingMixWise.js";
import { cardingEmployeePerformanceReport } from "../controllers/report/production/cardingEmployeePerformance.js";
import { drawingProductionSummaryReport } from "../controllers/report/production/drawingSummary.js";
import { drawingMachineWiseReport } from "../controllers/report/production/drawingMachineWise.js";
import { drawingStoppageReport } from "../controllers/report/production/drawingStoppage.js";
import { drawingShiftWiseReport } from "../controllers/report/production/drawingShiftWise.js";
import { drawingShiftWiseDetailsReport } from "../controllers/report/production/drawingShiftWiseDetails.js";
import { drawingMixWiseReport } from "../controllers/report/production/drawingMixWise.js";
import { drawingEmployeePerformanceReport } from "../controllers/report/production/drawingEmployeePerformance.js";
import { unilapProductionSummaryReport } from "../controllers/report/production/unilapSummary.js";
import { unilapMachineWiseReport } from "../controllers/report/production/unilapMachineWise.js";
import { unilapStoppageReport } from "../controllers/report/production/unilapStoppage.js";
import { unilapShiftWiseReport } from "../controllers/report/production/unilapShiftWise.js";
import { unilapShiftWiseDetailsReport } from "../controllers/report/production/unilapShiftWiseDetails.js";
import { unilapMixWiseReport } from "../controllers/report/production/unilapMixWise.js";
import { unilapEmployeePerformanceReport } from "../controllers/report/production/unilapEmployeePerformance.js";
import { comberProductionSummaryReport } from "../controllers/report/production/comberSummary.js";
import { comberMachineWiseReport } from "../controllers/report/production/comberMachineWise.js";
import { comberStoppageReport } from "../controllers/report/production/comberStoppage.js";
import { comberShiftWiseReport } from "../controllers/report/production/comberShiftWise.js";
import { comberEmployeePerformanceReport } from "../controllers/report/production/comberEmployeePerformance.js";
import { comberShiftWiseDetailsReport } from "../controllers/report/production/comberShiftWiseDetails.js";
import { comberMixWiseReport } from "../controllers/report/production/comberMixWise.js";
import { finisherDrawingProductionSummaryReport } from "../controllers/report/production/finisherDrawingSummary.js";
import { finisherDrawingMachineWiseReport } from "../controllers/report/production/finisherDrawingMachineWise.js";
import { finisherDrawingStoppageReport } from "../controllers/report/production/finisherDrawingStoppage.js";
import { finisherDrawingShiftWiseReport } from "../controllers/report/production/finisherDrawingShiftWise.js";
import { finisherDrawingEmployeePerformanceReport } from "../controllers/report/production/finisherDrawingEmployeePerformance.js";
import { finisherDrawingShiftWiseDetailsReport } from "../controllers/report/production/finisherDrawingShiftWiseDetails.js";
import { finisherDrawingMixWiseReport } from "../controllers/report/production/finisherDrawingMixWise.js";
import { simplexProductionSummaryReport } from "../controllers/report/production/simplexSummary.js";
import { simplexMachineWiseReport } from "../controllers/report/production/simplexMachineWise.js";
import { simplexStoppageReport } from "../controllers/report/production/simplexStoppage.js";
import { simplexShiftWiseReport } from "../controllers/report/production/simplexShiftWise.js";
import { simplexEmployeePerformanceReport } from "../controllers/report/production/simplexEmployeePerformance.js";
import { spinningProductionSummaryReport } from "../controllers/report/production/spinningSummary.js";
import { spinningMachineWiseReport } from "../controllers/report/production/spinningMachineWise.js";
import { spinningCountWiseReport } from "../controllers/report/production/spinningCountWise.js";
import { spinningStoppageReport } from "../controllers/report/production/spinningStoppage.js";
import { spinningShiftWiseReport } from "../controllers/report/production/spinningShiftWise.js";
import { spinningEmployeePerformanceReport } from "../controllers/report/production/spinningEmployeePerformance.js";
import { spinningDailyEndBreakReport } from "../controllers/report/production/spinningDailyEndBreak.js";

// Production -> OverAll Report
import { overAllProductionReport } from "../controllers/report/production/overAllProduction.js";
import { overAllSummaryReport } from "../controllers/report/production/overAllSummary.js";
import { overAllStoppageReport } from "../controllers/report/production/overAllStoppage.js";
import { overAllWasteReport } from "../controllers/report/production/overAllWaste.js";
import { overAllUKGReport } from "../controllers/report/production/overAllUKG.js";
import { overAllEmployeePerformanceReport } from "../controllers/report/production/overAllEmployeePerformance.js";
import { overAllSupervisorReport } from "../controllers/report/production/overAllSupervisor.js";
import { spgAcPackingReport } from "../controllers/report/production/spgAcPacking.js";

const router = express.Router();

// Production -> Carding Production Report
router.get('/carding/summary', authenticate, cardingProductionSummaryReport);
router.get('/carding/machine-wise', authenticate, cardingMachineWiseReport);
router.get('/carding/stoppage', authenticate, cardingStoppageReport);
router.get('/carding/shift-wise', authenticate, cardingShiftWiseReport);
router.get('/carding/shift-wise-details', authenticate, cardingShiftWiseDetailsReport);
router.get('/carding/mix-wise', authenticate, cardingMixWiseReport);
router.get('/carding/employee-performance', authenticate, cardingEmployeePerformanceReport);

// Production -> Breaker Drawing Report
router.get('/drawing/summary', authenticate, drawingProductionSummaryReport);
router.get('/drawing/machine-wise', authenticate, drawingMachineWiseReport);
router.get('/drawing/stoppage', authenticate, drawingStoppageReport);
router.get('/drawing/shift-wise', authenticate, drawingShiftWiseReport);
router.get('/drawing/shift-wise-details', authenticate, drawingShiftWiseDetailsReport);
router.get('/drawing/mix-wise', authenticate, drawingMixWiseReport);
router.get('/drawing/employee-performance', authenticate, drawingEmployeePerformanceReport);

// Production -> UniLap Report
router.get('/unilap/summary', authenticate, unilapProductionSummaryReport);
router.get('/unilap/machine-wise', authenticate, unilapMachineWiseReport);
router.get('/unilap/stoppage', authenticate, unilapStoppageReport);
router.get('/unilap/shift-wise', authenticate, unilapShiftWiseReport);
router.get('/unilap/shift-wise-details', authenticate, unilapShiftWiseDetailsReport);
router.get('/unilap/mix-wise', authenticate, unilapMixWiseReport);
router.get('/unilap/employee-performance', authenticate, unilapEmployeePerformanceReport);

// Production -> Comber Report
router.get('/comber/summary', authenticate, comberProductionSummaryReport);
router.get('/comber/machine-wise', authenticate, comberMachineWiseReport);
router.get('/comber/stoppage', authenticate, comberStoppageReport);
router.get('/comber/shift-wise', authenticate, comberShiftWiseReport);
router.get('/comber/employee-performance', authenticate, comberEmployeePerformanceReport);
router.get('/comber/shift-wise-details', authenticate, comberShiftWiseDetailsReport);
router.get('/comber/mix-wise', authenticate, comberMixWiseReport);

// Production -> Finisher Drawing Report
router.get('/finisher-drawing/summary', authenticate, finisherDrawingProductionSummaryReport);
router.get('/finisher-drawing/machine-wise', authenticate, finisherDrawingMachineWiseReport);
router.get('/finisher-drawing/stoppage', authenticate, finisherDrawingStoppageReport);
router.get('/finisher-drawing/shift-wise', authenticate, finisherDrawingShiftWiseReport);
router.get('/finisher-drawing/employee-performance', authenticate, finisherDrawingEmployeePerformanceReport);
router.get('/finisher-drawing/shift-wise-details', authenticate, finisherDrawingShiftWiseDetailsReport);
router.get('/finisher-drawing/mix-wise', authenticate, finisherDrawingMixWiseReport);

// Production -> Simplex Report
router.get('/simplex/summary', authenticate, simplexProductionSummaryReport);
router.get('/simplex/machine-wise', authenticate, simplexMachineWiseReport);
router.get('/simplex/stoppage', authenticate, simplexStoppageReport);
router.get('/simplex/shift-wise', authenticate, simplexShiftWiseReport);
router.get('/simplex/employee-performance', authenticate, simplexEmployeePerformanceReport);

// Production -> Spinning Report
router.get('/spinning/summary', authenticate, spinningProductionSummaryReport);
router.get('/spinning/machine-wise', authenticate, spinningMachineWiseReport);
router.get('/spinning/count-wise', authenticate, spinningCountWiseReport);
router.get('/spinning/stoppage', authenticate, spinningStoppageReport);
router.get('/spinning/shift-wise', authenticate, spinningShiftWiseReport);
router.get('/spinning/employee-performance', authenticate, spinningEmployeePerformanceReport);
router.get('/spinning/daily-end-break', authenticate, spinningDailyEndBreakReport);

// Production -> OverAll Report
router.get('/overall/production', authenticate, overAllProductionReport);
router.get('/overall/summary', authenticate, overAllSummaryReport);
router.get('/overall/stoppage', authenticate, overAllStoppageReport);
router.get('/overall/waste', authenticate, overAllWasteReport);
router.get('/overall/ukg', authenticate, overAllUKGReport);
router.get('/overall/employee-performance', authenticate, overAllEmployeePerformanceReport);
router.get('/overall/supervisor', authenticate, overAllSupervisorReport);
router.get('/overall/spg-ac-packing', authenticate, spgAcPackingReport);

export default router;
