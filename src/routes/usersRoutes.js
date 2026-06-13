import express from "express";
import { getUsers } from "../controllers/users.comtroller.js";
import { authenticate } from "../middleware/authMiddleware.js";


const router = express.Router();

router.get('/list', authenticate, getUsers);

export default router;
