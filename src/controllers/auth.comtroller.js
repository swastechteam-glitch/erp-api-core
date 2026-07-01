import dotenv from "dotenv";
dotenv.config();

import sql from "mssql";
import jwt from "jsonwebtoken";
import { currentYear, decryptData } from "../utils/common.js";
import os from "os";
import { getPool } from "../config/dynamicDB.js";

// ⚠️ move to process.env in production

export const generateToken = (
  user,
  FyCode,
  nodeRegistration,
  branchCode,
  companyCode,
  isSuperAdmin = false,
) => {
  const JWT_SECRET = "Textiels-erp-api";
  return jwt.sign(
    {
      userId: user.UserCode,
      UName: user.UName,
      companyCode: companyCode,
      FYCode: FyCode,
      // FYStart: FYStart,
      // FYEnd: FYEnd,
      nodeCode: nodeRegistration?.NodeCode,
      branchCode: branchCode,
      // Drives TPN2 DB routing in authMiddleware: super-admins -> external
      // server, everyone else -> internal LAN server.
      isSuperAdmin: !!isSuperAdmin,
      // userDetaild: user,
    },
    JWT_SECRET,
    { expiresIn: "4h" },
  );
};
// Look up the user's RBAC role (RoleName + IsSuperAdmin) so the web app can
// decide which app shell to show on login. Never breaks login: returns null if
// the RBAC tables aren't deployed yet (SQL 208) or anything else goes wrong.
const getUserRoleInfo = async (pool, userCode) => {
  try {
    const r = await pool
      .request()
      .input("UserCode", sql.Int, userCode)
      .query(`
        SELECT TOP 1 r.RoleCode, r.RoleName, r.IsSuperAdmin
        FROM dbo.tbl_web_UserRole ur
        JOIN dbo.tbl_web_Role r ON r.RoleCode = ur.RoleCode AND r.Status = 1
        WHERE ur.UserCode = @UserCode
      `);
    return r.recordset[0] || null;
  } catch (err) {
    return null; // RBAC not configured / lookup failed -> no role (full menu fallback)
  }
};

// Owner accounts that are ALWAYS treated as super admin, mirroring the Role
// Access controller's isForcedSuperAdmin (UserCode 1/6, or UName SWASTEAM).
// Login MUST honor this too: otherwise these accounts get isSuperAdmin=false in
// their token, and the TPN2/LOCALHOST split LAN-gates them to the internal
// server — so an admin can't work off campus (and can't even bootstrap RBAC).
// Temporary until a real Super Admin role is assigned via the Role Access screen.
const FORCE_SUPER_ADMIN_USER_CODES = [1, 6];
const FORCE_SUPER_ADMIN_UNAMES = ["SWASTEAM"];
const isForcedSuperAdminUser = (user) =>
  FORCE_SUPER_ADMIN_USER_CODES.includes(Number(user?.UserCode)) ||
  FORCE_SUPER_ADMIN_UNAMES.includes((user?.UName || "").toString().trim().toUpperCase());

export const authLogin = async (req, res) => {
  try {
    const { UName, WebPassword, companyCode, branchCode, fyCode } = req.body;
    console.log(req.body, "Body 434343");

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    // Login authenticates against the configured server for this client.
    // For TPN2 that is the external server (61.2.74.74) so every user can log
    // in. Role-based DB routing happens AFTER login in authMiddleware, once we
    // know whether the user is a super-admin.
    const pool = await getPool(req.headers.subdbname);
    const nodeRegistration = await checkNodeRegistration(req.headers.subdbname);

    // const fyCode = process.env.FYCODE;
    // const fyCodeResult = await pool
    //   .request()
    //   .input("givenYear", sql.VarChar, fyCode).query(`
    //     SELECT TOP 1 FYCode, FYear, FYStart, FYEnd
    //     FROM tbl_FYear
    //     WHERE FYear = @givenYear
    //   `);

    const result = await pool
      .request()
      .input("UName", sql.VarChar, UName)
      .input("companyCode", sql.Int, companyCode).query(`
        SELECT * FROM dbo.vw_User
        WHERE UName = @UName AND companyCode = @companyCode AND Status = 1
      `);

    // const FyCode = fyCodeResult?.recordset?.[0]?.FYCode;
    // const FYStart = fyCodeResult?.recordset?.[0]?.FYStart;
    // const FYEnd = fyCodeResult?.recordset?.[0]?.FYEnd;

    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      const decodedPassword = decryptData(user.WebPassword);
      console.log(user, "user 3434");

      if (decodedPassword === WebPassword) {
        if (user.Photo) {
          user.Photo = `data:image/jpeg;base64,${Buffer.from(
            user.Photo,
          ).toString("base64")}`;
        }

        // Look up the RBAC role first: it decides the app shell on the web app
        // AND the TPN2 DB routing (super-admin -> external, others -> internal).
        const roleInfo = await getUserRoleInfo(pool, user.UserCode);
        const isSuperAdmin = isForcedSuperAdminUser(user) || !!roleInfo?.IsSuperAdmin;

        const token = generateToken(
          user,
          fyCode,
          nodeRegistration,
          branchCode,
          companyCode,
          isSuperAdmin,
        );

        // Attach the user's RBAC role so the web app can pick the right shell
        // (management vs employee) and so normalizeAccess() gets a real role.
        user.role = roleInfo?.RoleName || null;
        user.roleCode = roleInfo?.RoleCode || null;
        user.isSuperAdmin = isSuperAdmin;

        return res.status(200).json({ success: true, token, user });
      }
    }

    return res
      .status(400)
      .json({ success: false, message: "Invalid User Name or Password" });
  } catch (err) {
    console.error("SQL error", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getFinancialYears = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    // ✨ NEW: Your requested query to get the list of years
    const result = await pool.request().query(`
      SELECT FYCode, FYear 
      FROM tbl_FYear 
      ORDER BY FYCode DESC
    `);

    return res.status(200).json({ success: true, data: result.recordset });
  } catch (err) {
    console.error("SQL error fetching financial years", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
export const tokenCreate = async (req, res) => {
  try {
    const { UName, companyCode, branchCode } = req.body;
    console.log(req.body, "Body 434343");

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const nodeRegistration = await checkNodeRegistration(req.headers.subdbname);
    console.log(
      nodeRegistration,
      req.headers.subdbname,
      "nodeRegistration 2322",
    );

    const fyCode = process.env.FYCODE;
    const fyCodeResult = await pool
      .request()
      .input("givenYear", sql.VarChar, fyCode).query(`
        SELECT TOP 1 FYCode, FYear, FYStart, FYEnd
        FROM tbl_FYear
        WHERE FYear = @givenYear
      `);

    const result = await pool
      .request()
      .input("UName", sql.VarChar, UName)
      .input("companyCode", sql.Int, companyCode).query(`
        SELECT * FROM dbo.vw_User
        WHERE UName = @UName AND companyCode = @companyCode AND Status = 1
      `);
    const FyCode = fyCodeResult?.recordset?.[0]?.FYCode;
    const FYStart = fyCodeResult?.recordset?.[0]?.FYStart;
    const FYEnd = fyCodeResult?.recordset?.[0]?.FYEnd;

    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      // const decodedPassword = decryptData(user.WebPassword);
      // console.log(user,'user 3434');

      // if (decodedPassword === WebPassword) {
      //   if (user.Photo) {
      //     user.Photo = `data:image/jpeg;base64,${Buffer.from(
      //       user.Photo
      //     ).toString("base64")}`;
      //   }

      const roleInfo = await getUserRoleInfo(pool, user.UserCode);
      const isSuperAdmin = isForcedSuperAdminUser(user) || !!roleInfo?.IsSuperAdmin;
      const token = generateToken(
        user,
        FyCode,
        nodeRegistration,
        branchCode,
        companyCode,
        isSuperAdmin,
      );
      user.role = roleInfo?.RoleName || null;
      user.roleCode = roleInfo?.RoleCode || null;
      user.isSuperAdmin = isSuperAdmin;
      return res.status(200).json({ success: true, token, user });
      // }
    }

    return res
      .status(400)
      .json({ success: false, message: "Invalid User Name or Password" });
  } catch (err) {
    console.error("SQL error", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const checkNodeRegistration = async (subdbname) => {
  try {
    // Step 1: Get MAC address
    const networkInterfaces = os.networkInterfaces();
    let mac = "";

    for (const iface of Object.values(networkInterfaces)) {
      for (const details of iface) {
        if (
          !details.internal &&
          details.mac &&
          details.mac !== "00:00:00:00:00:00"
        ) {
          mac = details.mac.replace(/:/g, "").toUpperCase(); // format like VB.NET
          break;
        }
      }
      if (mac) break;
    }

    if (!mac) {
      return { success: false, message: "MAC Address not found" };
    }

    const pool = await getPool(subdbname);
    const result = await pool
      .request()
      .input("NodeAddress", sql.VarChar, mac)
      .query("SELECT * FROM tbl_Node WHERE NodeAddress = @NodeAddress");

    // if (result.recordset.length === 0) {
    //   return { success: false, message: "Please Register" };
    // }

    const node = result.recordset[0];

    // Step 3: Check status
    if (node?.Status === 0) {
      return {
        success: false,
        message: "Please Contact your System Administrator",
      };
    }

    // Step 4: Return NodeCode
    return {
      success: true,
      NodeCode: node?.NodeCode,
      message: "Node verified successfully",
    };
  } catch (err) {
    console.error("Error in checkNodeRegistration:", err);
    return { success: false, error: err.message };
  }
};
