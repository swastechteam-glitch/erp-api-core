import jwt from "jsonwebtoken";

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

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(403).json({ error: "Oops! Your session expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
};
