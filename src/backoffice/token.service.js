import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

// Same RS256 key pair slot-rc-duckhunt uses (copied to operator-backend root).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../../');
const privateKey = fs.readFileSync(path.join(ROOT, 'private_key.pem'), 'utf8');
const publicKey = fs.readFileSync(path.join(ROOT, 'public_key.pem'), 'utf8');

const ISSUER = 'Slot Authentication service';
const SUBJECT = 'test@sdlccorp.com';
const ACCESS_DAYS = Number(process.env.ACCESS_TOKEN_EXPIRE_TIME || 15);
const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRE_TIME || 30);

export function generateToken(userId, role) {
  const payload = { id: userId, role, iat: Math.floor(Date.now() / 1000) };
  const base = { issuer: ISSUER, subject: SUBJECT, algorithm: 'RS256' };
  const access_token = jwt.sign(payload, privateKey, { ...base, expiresIn: `${ACCESS_DAYS}d` });
  const refresh_token = jwt.sign(payload, privateKey, { ...base, expiresIn: `${REFRESH_DAYS}d` });
  return { access_token, refresh_token };
}

export function verifyAccessToken(token) {
  return jwt.verify(token, publicKey, { issuer: ISSUER, subject: SUBJECT, algorithms: ['RS256'] });
}

export default { generateToken, verifyAccessToken };
