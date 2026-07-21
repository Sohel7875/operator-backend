// Response shape mirrors slot-rc-duckhunt: { status:<httpCode>, message, data }.
// The backoffice frontend reads response.data.{data,pagination,series,rows,totals,user}.
export function sendResponse(res, status, message, data = null) {
  return res.status(status).json({ status, message, data });
}

const STATUS_MAP = { 200: 200, 201: 201, 400: 400, 401: 401, 403: 403, 404: 404, 409: 409, 422: 422, 429: 429, 500: 500 };

/** Map a service result { status, code, msg, data } to an HTTP response. */
export function respondFromService(res, result, defaultSuccessMessage = 'OK') {
  if (result?.status) {
    const httpCode = STATUS_MAP[result?.code] || 200;
    const message = result?.msg || result?.data?.msg || defaultSuccessMessage;
    return sendResponse(res, httpCode, message, result?.data ?? null);
  }
  const httpCode = STATUS_MAP[result?.code] || 400;
  return sendResponse(res, httpCode, result?.msg || 'Something went wrong', null);
}

export default { sendResponse, respondFromService };
