import express from "express";
import {
    gateOutApproval,
  getGoodsOutPassApproveOverview,
  getVehicleInOutApproveOverview,
  vehicleInOutApproval,
} from "../controllers/gateOverview.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Post Data

router.post(
  "/vehicle-in-out/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  vehicleInOutApproval
);


router.post(
  "/gate-out/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  gateOutApproval
);

// Get List
router.get(
  "/goods-out-approve-overview/list/:id",
  authenticate,
  getGoodsOutPassApproveOverview
);
router.get(
  "/vehicle-in-out-approve-overview/list/:id",
  authenticate,
  getVehicleInOutApproveOverview
);

export default router;
