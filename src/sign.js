import crypto from 'crypto';

// Mirrors slot-aggregator/src/security/signature.js
export function sha256Hex(input) {
  return crypto.createHash('sha256').update(input ?? '', 'utf8').digest('hex');
}

export function buildCanonical({ method, path, timestamp, nonce, body }) {
  const bodyHash = sha256Hex(typeof body === 'string' ? body : JSON.stringify(body ?? ''));
  return [String(method).toUpperCase(), path, String(timestamp), String(nonce), bodyHash].join('\n');
}

export function sign({ secret, method, path, timestamp, nonce, body }) {
  return crypto.createHmac('sha256', secret).update(buildCanonical({ method, path, timestamp, nonce, body }), 'utf8').digest('hex');
}

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function verify({ secret, method, path, timestamp, nonce, body, signature }) {
  return safeEqual(sign({ secret, method, path, timestamp, nonce, body }), signature);
}

export const newNonce = () => crypto.randomBytes(16).toString('hex');
export const nowSeconds = () => Math.floor(Date.now() / 1000);
