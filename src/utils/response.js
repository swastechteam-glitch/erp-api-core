// ---------------------------------------------------------------------------
// Common API response helpers — keep controllers free of repeated res.json(...)
// boilerplate and give every endpoint a consistent response shape.
// ---------------------------------------------------------------------------

// Plain success payload.
export const sendSuccess = (res, data = null, message = "Success", status = 200) =>
  res.status(status).json({ success: true, message, data });

// Error payload.
export const sendError = (res, error = "Something went wrong", status = 500) =>
  res
    .status(status)
    .json({ success: false, error: typeof error === "string" ? error : error?.message });

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
