import express from "express";
import { notificationUpdate,} from "../controllers/notifications.comtroller.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { notificationJob, notificationToken, notificationTokenDelete, getNotificationToken } from "../queue/producer.js";

const router = express.Router();

router.post(
  "/bull-notification/save",
  authenticate,
//   purchaseOrderValidationRules,
//   validatePurchaseOrder,
  notificationJob
);

router.post(
  "/token-save",
  authenticate,
//   purchaseOrderValidationRules,
//   validatePurchaseOrder,
  notificationToken
);

router.get('/token/list', authenticate, getNotificationToken);

router.put(
  "/update",
  authenticate,
//   purchaseOrderValidationRules,
//   validatePurchaseOrder,
  notificationUpdate
);

router.put(
  "/token/delete/:id",
  // authenticate,
//   purchaseOrderValidationRules,
//   validatePurchaseOrder,
  notificationTokenDelete
);



export default router;