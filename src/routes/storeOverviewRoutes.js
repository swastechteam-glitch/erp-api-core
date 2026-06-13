import express from "express";
import {
  getPurchaseAdviceApproveOverview,
  getPurchaseOrderApprove1Overview,
  getPurchaseOrderApprove2Overview,
  getPurchaseOrderApprove3Overview,
  getBillPassingOverview,
  getGoodsInApprovalOverview,
  getGoodsOutApproval1Overview,
  getGoodsOutApproval2Overview,
  storePurchaseAdviceApproval,
  purchaseAdviceApproveDetails,
  storePurchaseOrderApproval,
  storePurchaseOrderApprovalGM,
  storePurchaseOrderApprovalMD,
  storeBillPassingApproval,
  storeGoodsInApproval,
  storeGoodsOutApprovalOne,
  storeGoodsOutApprovalTwo,
} from "../controllers/storeOverview.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();
// Post data's

router.post(
  "/store-purchase-advice/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  storePurchaseAdviceApproval
);

router.post(
  "/store-purchase-advice-details/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  purchaseAdviceApproveDetails
);

router.post(
  "/store-purchase-order/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  storePurchaseOrderApproval
);

router.post(
  "/store-purchase-order-gm/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  storePurchaseOrderApprovalGM
);

router.post(
  "/store-purchase-order-md/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  storePurchaseOrderApprovalMD
);

router.post(
  "/store-bill-passing/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  storeBillPassingApproval
);


router.post(
  "/store-goods-in/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  storeGoodsInApproval
);

router.post(
  "/store-goods-out-one/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  storeGoodsOutApprovalOne
);

router.post(
  "/store-goods-out-two/approve",
  authenticate,
  //   purchaseOrderValidationRules,
  //   validatePurchaseOrder,
  storeGoodsOutApprovalTwo
);


// Get data's

router.get(
  "/purchase-advice-approve-overview/list/:id",
  authenticate,
  getPurchaseAdviceApproveOverview
);
router.get(
  "/purchase-order-approve1-overview/list/:id",
  authenticate,
  getPurchaseOrderApprove1Overview
);
router.get(
  "/purchase-order-approve2-overview/list/:id",
  authenticate,
  getPurchaseOrderApprove2Overview
);
router.get(
  "/purchase-order-approve3-overview/list/:id",
  authenticate,
  getPurchaseOrderApprove3Overview
);
router.get(
  "/bill-passing-overview/list/:id",
  authenticate,
  getBillPassingOverview
);
router.get(
  "/goods-in-approval-overview/list/:id",
  authenticate,
  getGoodsInApprovalOverview
);
router.get(
  "/goods-out-approval1-overview/list/:id",
  authenticate,
  getGoodsOutApproval1Overview
);
router.get(
  "/goods-out-approval2-overview/list/:id",
  authenticate,
  getGoodsOutApproval2Overview
);

export default router;
