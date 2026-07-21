import { verifyToken } from '../services/auth.service.js';

/** Player JWT guard for the frontend-facing API. Sets req.userId / req.username. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    req.username = payload.username;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

export default requireAuth;
