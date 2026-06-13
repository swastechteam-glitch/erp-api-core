import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { getCottonStockBalesWiseGraph, getCottonPOPendingGraph, getProductionAllDepartmentGraph, getSpinningProductionGraph, getAutoconerProductionGraph,
    getYarnStockGraph, getYarnProductionGraph, getEmployeeAttendanceGraph, getStoreIssueGraph
 } from "../controllers/graph.comtroller.js";


const router = express.Router();

router.get('/cotton/stock-bales-wise', authenticate, getCottonStockBalesWiseGraph);
router.get('/cotton/po-pendings', authenticate, getCottonPOPendingGraph);
router.get('/production/production-all-department', authenticate, getProductionAllDepartmentGraph);
router.get('/production/spinning-Production', authenticate, getSpinningProductionGraph);
router.get('/production/autoconer-Production', authenticate, getAutoconerProductionGraph);
router.get('/yarn/yarn-stock', authenticate, getYarnStockGraph);
router.get('/yarn/yarn-Production', authenticate, getYarnProductionGraph);
router.get('/hrm/employee-attendance', authenticate, getEmployeeAttendanceGraph);
router.get('/store/store-issue', authenticate, getStoreIssueGraph);




export default router;
