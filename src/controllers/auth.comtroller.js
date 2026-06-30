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

export const authLogin = async (req, res) => {
  try {
    const { UName, WebPassword, companyCode, branchCode, fyCode } = req.body;
    console.log(req.body, "Body 434343");

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

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

        const token = generateToken(
          user,
          fyCode,
          nodeRegistration,
          branchCode,
          companyCode,
        );

        // Attach the user's RBAC role so the web app can pick the right shell
        // (management vs employee) and so normalizeAccess() gets a real role.
        const roleInfo = await getUserRoleInfo(pool, user.UserCode);
        user.role = roleInfo?.RoleName || null;
        user.roleCode = roleInfo?.RoleCode || null;
        user.isSuperAdmin = !!roleInfo?.IsSuperAdmin;

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

      const token = generateToken(
        user,
        FyCode,
        nodeRegistration,
        branchCode,
        companyCode,
      );
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
