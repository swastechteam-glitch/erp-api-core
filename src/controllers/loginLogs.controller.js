import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { applyBranchCode, showBranchDropDown } from "../utils/common.js";

// ✅ Helper to safely extract and apply BranchCode
// const applyBranchCode = (request, headers) => {
//   const bCode = headers["branchCode"] || headers["branchcode"];
//   const companyCode = headers["companyCode"] || headers["companyCode"];
//   console.log(companyCode, 'companyCode 98799');
  
//   if (bCode) {
//     request.input("BranchCode", sql.Int, parseInt(bCode));
//   }
//   if (companyCode) {
//     request.input("CompanyCode", sql.Int, parseInt(companyCode));
//   }
// };

export const loginLogs = async (req, res) => {
  try {
    const bodyData = req.body;
    // const userId = req.headers.userid || req.headers.userId; // Handle case sensitivity
    let query;
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    const subdbname = showBranchDropDown(req.headers.subdbname);
    console.log(req.headers.subdbname,bodyData,subdbname, 'subdbname-------------*************');
    // ✅ Apply Branch Code
    // applyBranchCode(request, req.headers);
    if(subdbname){
      request.input("BranchCode", sql.Int,parseInt(bodyData.branchCode));
    }else{
      request.input("CompanyCode", sql.Int,parseInt(bodyData.companyCode));
    }

    request.input("UserID", sql.Int, bodyData?.userId);
    request.input(
      "MobileNumber",
      sql.VarChar(20),
      bodyData?.mobileNumber || null,
    );
    request.input("IPAddress", sql.VarChar(50), bodyData?.ip || null);
    request.input(
      "Latitude",
      sql.VarChar(50),
      bodyData?.latitude ? String(bodyData?.latitude) : null,
    );
    request.input(
      "Longitude",
      sql.VarChar(50),
      bodyData?.longitude ? String(bodyData?.longitude) : null,
    );
    request.input("City", sql.VarChar(100), bodyData?.city || null);
    request.input("District", sql.VarChar(100), bodyData?.district || null);
    request.input("State", sql.VarChar(100), bodyData?.state || null);
    request.input("Country", sql.VarChar(100), bodyData?.country || null);
    request.input("LoginDevice", sql.VarChar(50), bodyData?.device || null);
    request.input("Status", sql.VarChar(20), bodyData?.status || null);
    request.input("Pincode", sql.Int, bodyData?.pincode || null);
    request.input("Browser", sql.VarChar(20), bodyData?.browser || null);
    request.input(
      "BrowserVersion",
      sql.VarChar(20),
      bodyData?.browserVersion || null,
    );
    request.input("OS", sql.VarChar(20), bodyData?.os || null);
    request.input("OSVersion", sql.VarChar(20), bodyData?.osVersion || null);
    request.input(
      "ScreenResolution",
      sql.VarChar(20),
      bodyData?.screenResolution || null,
    );
    request.input("Language", sql.VarChar(20), bodyData?.language || null);
    request.input("StreetName", sql.VarChar(20), bodyData?.streetName || null);

    // ✅ Added BranchCode to INSERT and VALUES
    if (subdbname) {
      query = `
        INSERT INTO tbl_UserLoginLogs
        (UserID, MobileNumber, LoginDateTime, IPAddress, Latitude, Longitude, City, District, State, Country, LoginDevice, Status, Pincode, Browser, BrowserVersion, OS, OSVersion, ScreenResolution, Language, StreetName, BranchCode)
        VALUES
        (@UserID, @MobileNumber, GETDATE(), @IPAddress, @Latitude, @Longitude, @City, @District, @State, @Country, @LoginDevice, @Status, @Pincode, @Browser, @BrowserVersion, @OS, @OSVersion, @ScreenResolution, @Language, @StreetName, @BranchCode);
        
        SELECT SCOPE_IDENTITY() AS NewId;
      `;
    } else {
      query = `
        INSERT INTO tbl_UserLoginLogs
        (UserID, MobileNumber, LoginDateTime, IPAddress, Latitude, Longitude, City, District, State, Country, LoginDevice, Status, Pincode, Browser, BrowserVersion, OS, OSVersion, ScreenResolution, Language, StreetName, CompanyCode)
        VALUES
        (@UserID, @MobileNumber, GETDATE(), @IPAddress, @Latitude, @Longitude, @City, @District, @State, @Country, @LoginDevice, @Status, @Pincode, @Browser, @BrowserVersion, @OS, @OSVersion, @ScreenResolution, @Language, @StreetName, @CompanyCode);
        
        SELECT SCOPE_IDENTITY() AS NewId;
      `;
    }

    const result = await request.query(query);

    const newId =
      result.recordset && result.recordset[0]
        ? result.recordset[0].NewId
        : null;

    res.json({ success: true, LogID: newId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const logoutLogs = async (req, res) => {
  try {
    const { logId } = req.body;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    if (!logId)
      return res.status(400).json({ success: false, message: "Missing logId" });

    // ✅ Fixed: Use getPool instead of poolPromise (which wasn't imported)
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // ✅ Apply Branch Code (Good practice for context, even if update is by ID)
    applyBranchCode(request, req.headers);

    request.input("LogID", sql.Int, logId);

    const q = `
      UPDATE tbl_UserLoginLogs
      SET LogoutDateTime = GETDATE(), Status = 'Logout'
      WHERE LogID = @LogID
    `;

    await request.query(q);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getBranchList = async (req, res) => {
  try {
    const paramData = req.query;

    const page = parseInt(paramData.page) || 1;
    const pageSize = parseInt(paramData.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname) {
      return res.status(400).json({
        success: false,
        message: "Missing subDBName",
      });
    }

    const pool = await getPool(req.headers.subdbname);

    const result = await pool.request().query(`
        SELECT BranchName, BranchCode
        FROM tbl_Branch
        ORDER BY BranchCode
      `);

    const data = result.recordset;

    const results = data.map((item) => ({
      ...item,
      id: item.BranchCode, // adjust column name if needed
    }));

    const paginatedData = results.slice(offset, offset + pageSize);

    res.status(200).json({
      success: true,
      totalRecords: data.length,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      data: paginatedData,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
