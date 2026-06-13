// export const getBadgeData = async (req, res) => {
//   try {
    
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     let result = await pool.request().query("SELECT * FROM tbl_DashBoard");

//     res.status(200).json(result.recordset); // send rows as JSON
//   } catch (err) {
//     console.error("SQL error", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// export const refreshBadgeData = async (req, res) => {
//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     let result = await pool.request().execute("sp_DashBoard_Update");

//     res.status(200).json(result.recordset); // send rows as JSON
//   } catch (err) {
//     console.error("SQL error", err);
//     res.status(500).json({ error: err.message });
//   }
// };


import sql from 'mssql'; 
import { getPool } from "../config/dynamicDB.js";

export const getBadgeData = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    
    let query = "SELECT * FROM tbl_DashBoard";

    // Targeting branchCode header specifically
    if (req.headers['branchcode']) {
      request.input("BranchCode", sql.Int, parseInt(req.headers['branchcode']));
      query += " WHERE BranchCode = @BranchCode";
    }

    let result = await request.query(query);
    res.status(200).json(result.recordset); 
  } catch (err) {
    console.error("SQL error", err);
    res.status(500).json({ error: err.message });
  }
};

export const refreshBadgeData = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return res.status(400).json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Targeting branchCode header specifically
    if (req.headers['branchcode']) {
      request.input("BranchCode", sql.Int, parseInt(req.headers['branchcode']));
    }

    let result = await request.execute("sp_DashBoard_Update");
    res.status(200).json(result.recordset); 
  } catch (err) {
    console.error("SQL error", err);
    res.status(500).json({ error: err.message });
  }
};