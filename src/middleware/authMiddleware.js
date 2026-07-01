import jwt from "jsonwebtoken";
import { LAN_ROUTED_CLIENTS } from "../config/dbConfigMap.js";

export const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1]; // remove "Bearer"
  if (!token) {
    return res.status(401).json({ error: "Invalid token format" });
  }

  try {
    const decoded = jwt.verify(token, "Textiels-erp-api"); // your secret key
    console.log(decoded, 'decoded 3434');
    
    req.headers["FYCode"] = decoded.FYCode;
    req.headers["FYStart"] = decoded.FYStart;
    req.headers["FYEnd"] = decoded.FYEnd;
    req.headers["id"] = decoded.id;
    req.headers["nodeCode"] = decoded.nodeCode || 1;
    req.headers["userId"] = decoded.userId;
    req.headers["branchCode"] = decoded.branchCode || null;
    req.headers["companyCode"] = decoded.companyCode || null;
    req.user = decoded;

    // Role-based DB routing: super-admins stay on the client's external server;
    // every other user is routed to that client's internal LAN server so the
    // app only works on campus. Covers TPN2 (and LOCALHOST, which mirrors it in
    // dev). All getPool(req.headers.subdbname) call-sites pick this up; other
    // clients are unaffected.
    const clientKey = (req.headers.subdbname || "").toString().toUpperCase();
    const lanKey = LAN_ROUTED_CLIENTS[clientKey];
    if (lanKey && !decoded.isSuperAdmin) {
      req.headers.subdbname = lanKey;
    }

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(403).json({ error: "Oops! Your session expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
};
