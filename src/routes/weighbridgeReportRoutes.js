import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import {
  weighmentDateWise,
  weighmentItemWise,
  weighmentVehicleWise
} from "../controllers/report/weighbridge/weighment.js";

const router = express.Router();

// WeighBridge -> Weighment
router.get("/weighment/date-wise", authenticate, weighmentDateWise);
router.get("/weighment/item-wise", authenticate, weighmentItemWise);
router.get("/weighment/vehicle-wise", authenticate, weighmentVehicleWise);

export default router;
