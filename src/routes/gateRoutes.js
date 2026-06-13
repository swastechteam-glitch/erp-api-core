import express from "express";
import { getGateEntryGoodsOut, getVehicleInOut } from "../controllers/gate.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { vehicleInOutApproval } from "../controllers/gateOverview.controller.js";


const router = express.Router();


// Get list data
router.get('/gate-goods-out-approval/list', authenticate, getGateEntryGoodsOut);
router.get('/vehicle-in-out-approval/list', authenticate, getVehicleInOut);


export default router;
