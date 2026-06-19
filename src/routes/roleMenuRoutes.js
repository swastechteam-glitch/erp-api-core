import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import {
  requireSuperAdmin,
  getMyMenus,
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getMenus,
  getRoleMenus,
  saveRoleMenus,
  getUsers,
  saveUserRole,
  getUserMenus,
  saveUserMenus,
} from "../controllers/roleMenu.controller.js";

const router = express.Router();

// Available to every authenticated user — drives menu visibility on login.
router.get("/my-menus", authenticate, getMyMenus);

// Everything below is super-admin only.
router.get("/roles", authenticate, requireSuperAdmin, getRoles);
router.post("/roles", authenticate, requireSuperAdmin, createRole);
router.put("/roles/:roleCode", authenticate, requireSuperAdmin, updateRole);
router.delete("/roles/:roleCode", authenticate, requireSuperAdmin, deleteRole);

router.get("/menus", authenticate, requireSuperAdmin, getMenus);

router.get("/role-menus/:roleCode", authenticate, requireSuperAdmin, getRoleMenus);
router.post("/role-menus", authenticate, requireSuperAdmin, saveRoleMenus);

router.get("/users", authenticate, requireSuperAdmin, getUsers);
router.post("/user-role", authenticate, requireSuperAdmin, saveUserRole);

// Direct per-user menu assignment (overrides role on login).
router.get("/user-menus/:userCode", authenticate, requireSuperAdmin, getUserMenus);
router.post("/user-menus", authenticate, requireSuperAdmin, saveUserMenus);

export default router;
