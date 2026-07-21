import express from 'express';
import config from './config.js';
import { verify, nowSeconds } from './sign.js';
import * as wallet from './services/wallet.service.js';

// Seamless-wallet endpoints the AGGREGATOR calls. Mounted at ROOT so the signed
// path matches the aggregator's standard adapter ("/bet", "/win", ...).
// operatorPlayerId == the operator's User _id.
const router = express.Router();

function verifyAggregator(req, res, next) {
  const timestamp = req.header('X-Timestamp');
  const nonce = req.header('X-Nonce');
  const signature = req.header('X-Signature');
  const key = req.header('X-Aggregator-Key');

  if (!timestamp || !nonce || !signature) return res.status(401).json({ error: 'missing signature headers' });
  if (key && key !== config.apiKey) return res.status(401).json({ error: 'unknown aggregator key' });
  if (Math.abs(nowSeconds() - Number(timestamp)) > config.clockSkewSeconds) return res.status(401).json({ error: 'stale timestamp' });

  const ok = verify({
    secret: config.outboundSecret,
    method: req.method,
    path: req.path, // "/bet" etc
    timestamp,
    nonce,
    body: req.rawBody || '',
    signature,
  });
  if (!ok) return res.status(401).json({ error: 'bad signature' });
  next();
}

router.use(verifyAggregator);

router.post('/balance', async (req, res) => {
  try {
    const { operatorPlayerId, currency } = req.body;
    const b = await wallet.getBalance(operatorPlayerId);
    res.json({ balance: b.balance, currency: currency || b.currency });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/bet', async (req, res) => {
  try {
    const { operatorPlayerId, amount, txnId, roundId, gameCode } = req.body;
    const r = await wallet.bet({ userId: operatorPlayerId, amount: Number(amount), txnId, roundId, gameCode });
    if (r.insufficient) return res.status(402).json({ code: 'INSUFFICIENT_FUNDS', balance: r.balance });
    res.json({ balance: r.balance, operatorTxnRef: `op-${txnId}` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/win', async (req, res) => {
  try {
    const { operatorPlayerId, amount, txnId, roundId, gameCode } = req.body;
    const r = await wallet.win({ userId: operatorPlayerId, amount: Number(amount || 0), txnId, roundId, gameCode });
    res.json({ balance: r.balance, operatorTxnRef: `op-${txnId}` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/rollback', async (req, res) => {
  try {
    const { operatorPlayerId, txnId } = req.body;
    const r = await wallet.rollback({ userId: operatorPlayerId, txnId });
    res.json({ ok: true, balance: r.balance });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
