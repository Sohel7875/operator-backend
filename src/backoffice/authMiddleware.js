import { sendResponse } from './respond.js';
import { verifyAccessToken } from './token.service.js';

const ADMIN_ROLES = ['admin', 'superAdmin'];

/** Bearer RS256 guard. roles: string|array; admins always pass. */
export function auth(roles) {
  const allowed = roles ? (Array.isArray(roles) ? roles : String(roles).split(',')) : null;
  return (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) return sendResponse(res, 401, 'Unauthorized', null);
      const payload = verifyAccessToken(token);
      if (allowed && !allowed.includes(payload.role) && !ADMIN_ROLES.includes(payload.role)) {
        return sendResponse(res, 401, 'Unauthorized', null);
      }
      req.user = payload;
      next();
    } catch {
      return sendResponse(res, 401, 'Invalid or expired token', null);
    }
  };
}

export default auth;
