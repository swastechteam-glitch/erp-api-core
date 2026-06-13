// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const getUsers = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     let result = await pool.request().query("SELECT * FROM dbo.tbl_User");

//     res.status(200).json(result.recordset); // send rows as JSON
//   } catch (err) {
//     console.error("SQL error", err);
//     res.status(500).json({ error: err.message });
//   }
// };


import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { applyBranchCode } from "../utils/common.js";

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

export const getUsers = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    let query = "SELECT * FROM dbo.tbl_User";

    // ✅ Fix: Add BranchCode filter if header exists
    if (applyBranchCode(request, req.headers)) {
      query += " WHERE BranchCode = @BranchCode";
    }

    let result = await request.query(query);

    res.status(200).json(result.recordset); // send rows as JSON
  } catch (err) {
    console.error("SQL error", err);
    res.status(500).json({ error: err.message });
  }
};