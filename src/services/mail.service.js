// ---------------------------------------------------------------------------
// Mail service — sends mail using PER-COMPANY credentials stored server-side in
// tbl_Email (EmailCode = 2), exactly like the legacy WinForms app. Credentials
// are NEVER hardcoded or sent from the client: the account user/password come
// from the company's DB row; the SMTP host/port come from server env (defaulting
// to Gmail's 587/STARTTLS, which is what the old VB used).
//
//   .env (optional overrides):
//     SMTP_HOST=smtp.gmail.com
//     SMTP_PORT=587
//     SMTP_SECURE=false      // true only for implicit-TLS port 465
// ---------------------------------------------------------------------------

import nodemailer from "nodemailer";
import sql from "mssql";

// Per-company SMTP account (tbl_Email EmailCode = 2) -> { user, pass } | null.
export const getCompanyMailAccount = async (pool, companyCode) => {
  const r = await pool
    .request()
    .input("CompanyCode", sql.Int, parseInt(companyCode) || 0)
    .query(
      "SELECT TOP 1 EmailID, EMailPassword FROM tbl_Email WHERE CompanyCode = @CompanyCode AND EmailCode = 2",
    );
  const row = r.recordset?.[0];
  if (!row) return null;
  const user = (row.EmailID ?? "").toString().trim();
  const pass = (row.EMailPassword ?? "").toString().trim();
  if (!user) return null;
  return { user, pass };
};

// Send one mail. `attachments` follow nodemailer's shape
// ([{ filename, content: Buffer }]). Throws if the company has no mail account.
export const sendCompanyMail = async ({
  pool,
  companyCode,
  fromName,
  to,
  subject,
  text,
  html,
  attachments,
}) => {
  const account = await getCompanyMailAccount(pool, companyCode);
  if (!account)
    throw new Error("No email account is configured for this company (tbl_Email, EmailCode = 2).");

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = (process.env.SMTP_SECURE || "false").toLowerCase() === "true" || port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user: account.user, pass: account.pass },
  });

  return transporter.sendMail({
    from: fromName ? `"${fromName}" <${account.user}>` : account.user,
    to,
    subject,
    text,
    html,
    attachments,
  });
};

export default sendCompanyMail;
