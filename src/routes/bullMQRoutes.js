import express from "express";
import { loginLogs, logoutLogs } from "../controllers/loginLogs.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { testBullMQ } from "../controllers/bullMQController.js";

const router = express.Router();

router.get(
  "/test-queue",
  // authenticate,
  testBullMQ
);


export default router;