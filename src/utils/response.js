// ---------------------------------------------------------------------------
// Common API response helpers — keep controllers free of repeated res.json(...)
// boilerplate and give every endpoint a consistent response shape.
// ---------------------------------------------------------------------------

// Plain success payload.
export const sendSuccess = (res, data = null, message = "Success", status = 200) =>
  res.status(status).json({ success: true, message, data });

// Pull a meaningful message out of an error. mssql often leaves the top-level
// `.message` empty and stashes the real SQL text in `.precedingErrors` or
// `.originalError`, which is why some failures came back as error:"".
export const dbErrorMessage = (error) => {
  if (!error) return "";
  if (typeof error === "string") return error;

  const parts = [];
  if (error.message) parts.push(error.message);
  if (Array.isArray(error.precedingErrors)) {
    error.precedingErrors.forEach((e) => e?.message && parts.push(e.message));
  }
  if (!parts.length && error.originalError) {
    parts.push(
      error.originalError.message ||
        error.originalError.info?.message ||
        ""
    );
  }
  return parts.filter(Boolean).join("; ");
};

// Error payload. `extra` (optional) merges extra fields into the JSON body —
// e.g. { field: "vehicleNo" } for structured client-side field errors. Existing
// 3-arg callers are unaffected.
export const sendError = (res, error = "Something went wrong", status = 500, extra = null) => {
  const message =
    typeof error === "string"
      ? error
      : dbErrorMessage(error) || "Something went wrong";
  return res
    .status(status)
    .json({ success: false, error: message, ...(extra && typeof extra === "object" ? extra : {}) });
};

// Paginated list payload. Pass the FULL list; slicing is done here.
export const sendPaginated = (res, list = [], { page = 1, pageSize = 10 } = {}, status = 200) => {
  const currentPage = parseInt(page) || 1;
  const size = parseInt(pageSize) || 10;
  const offset = (currentPage - 1) * size;

  return res.status(status).json({
    success: true,
    totalRecords: list.length,
    currentPage,
    pageSize: size,
    totalPages: Math.ceil(list.length / size),
    data: list.slice(offset, offset + size),
  });
};
