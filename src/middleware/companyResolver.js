// src/middleware/companyResolver.js
export const companyResolver = (req, res, next) => {
  let subDBName = req.headers.subdbname;
  // if header illa na — try subdomain la irunthu pick pannu
  if (!subDBName) {
    const host = req.hostname || "";
    if (host.includes(".")) {
      subDBName = host.split(".")[0].toUpperCase(); // kpf.yourdomain.com → KPF
    }
  }
  if (!subDBName) {
    return res.status(400).json({
      message:
        "Missing subDBName. Send in header or use subdomain (e.g., subdomain.maindomain.com)",
    });
  }
  req.subDBName = subDBName;
  next();
};
