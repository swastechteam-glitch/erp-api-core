import sql from "mssql";
import path from "path";
import fs from "fs";
import { getPool } from "../config/dynamicDB.js";

export const testDBConnection = async (req, res) => {
  try {
    console.log(req.headers.subdbname, 'SubDb name');
    
    const pool = await getPool(req.headers.subdbname); // from middleware
    const result = await pool.request().query("SELECT * FROM tbl_company");
    console.log( result?.recordset?.[0], "result");
    return res
      .status(200)
      .json({
        success: true,
        data: result?.recordset,
        company: req.headers.subdbname,
      });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
