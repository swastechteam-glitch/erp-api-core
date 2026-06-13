import express from "express";
import { authLogin,tokenCreate,getFinancialYears } from "../controllers/auth.comtroller.js";


const router = express.Router();

router.post('/login', authLogin);
router.post('/token-create', tokenCreate);
router.get('/fycode-list', getFinancialYears);

export default router;
