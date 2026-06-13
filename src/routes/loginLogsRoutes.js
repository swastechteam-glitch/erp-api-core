import express from "express";
import { getBranchList, loginLogs, logoutLogs } from "../controllers/loginLogs.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/user-loginlogs",
  // authenticate,
  loginLogs
);

router.post(
  "/user-logoutlogs",
  authenticate,
  logoutLogs
);


router.get('/branch/list', getBranchList);

export default router;