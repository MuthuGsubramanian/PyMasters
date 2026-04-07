/**
 * Safely extract a displayable error message from API errors.
 *
 * Handles all common shapes:
 * - Pydantic 422: { detail: [{type, loc, msg, input}, ...] }
 * - FastAPI string: { detail: "some message" }
 * - Axios error: { response: { data: { detail: ... } } }
 * - Plain Error: { message: "..." }
 * - Plain string: "some message"
 */
export function safeErrorMsg(err, fallback = 'Something went wrong') {
  // Extract detail from various error shapes
  const detail =
    err?.response?.data?.detail ??
    err?.detail ??
    err?.response?.data?.message ??
    err?.message ??
    err;

  if (typeof detail === 'string') return detail;

  // Pydantic validation errors: array of {type, loc, msg, input}
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d === 'string' ? d : d?.msg || ''))
      .filter(Boolean);
    return msgs.join('; ') || fallback;
  }

  // Object with msg or message
  if (detail && typeof detail === 'object') {
    return detail.msg || detail.message || fallback;
  }

  return fallback;
}
