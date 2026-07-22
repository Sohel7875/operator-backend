import axios from 'axios';
import config from './config.js';
import { sign, newNonce, nowSeconds } from './sign.js';

// Signs operator -> aggregator calls with our inboundSecret.
function signedHeaders(method, path, bodyStr) {
  const timestamp = nowSeconds();
  const nonce = newNonce();
  const signature = sign({
    secret: config.inboundSecret,
    method,
    path,
    timestamp,
    nonce,
    body: bodyStr,
  });
  return {
    'Content-Type': 'application/json',
    'X-Operator-Key': config.apiKey,
    'X-Timestamp': String(timestamp),
    'X-Nonce': nonce,
    'X-Signature': signature,
  };
}

/** Fetch the games the aggregator has APPROVED for this operator (enabledGames). */
export async function fetchGames() {
  const path = '/v1/operator/games';
  const bodyStr = ''; // GET — empty body; aggregator hashes sha256('')
  console.log(`${config.aggregatorRestUrl}${path}`)
  const res = await axios.get(`${config.aggregatorRestUrl}${path}`, {
    headers: signedHeaders('GET', path, bodyStr),
    validateStatus: () => true,
  });
  if (res.status !== 200) throw new Error(res.data?.message || `games fetch failed ${res.status}`);
  return res.data.data || []; // [{ game_code, name, provider, rtp, thumbnail, ... }]
}

/** Request a game launch on behalf of a player. */
export async function launch({ operatorPlayerId, gameCode, currency, mode = 'real' }) {
  const path = '/v1/operator/game/launch';
  const payload = { operatorPlayerId, gameCode, currency: currency || config.currency, mode: mode === 'demo' ? 'demo' : 'real', lang: 'en' };
  const bodyStr = JSON.stringify(payload);
  const res = await axios.post(`${config.aggregatorRestUrl}${path}`, bodyStr, {
    headers: signedHeaders('POST', path, bodyStr),
    validateStatus: () => true,
  });
  if (res.status !== 200) throw new Error(res.data?.message || `launch failed ${res.status}`);
  return res.data.data; // { launchUrl, token, socketUrl, expiresIn }
}

export default { launch, fetchGames };
