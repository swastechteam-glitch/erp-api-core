import express from "express";
import {
  getOptions,
  getDesignations,
  getList,
  getById,
  create,
  update,
  remove,
} from "../controllers/workLoad.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// Work Load master CRUD (frmWorkLoad / frmWorkLoadDetails)
router.get("/options", authenticate, getOptions);
router.get("/designations/:departmentCode", authenticate, getDesignations);
router.get("/lists", authenticate, getList);
router.get("/list/:workLoadCode", authenticate, getById);
router.post("/create", authenticate, create);
router.put("/update/:workLoadCode", authenticate, update);
router.delete("/delete/:workLoadCode", authenticate, remove);

export default router;
