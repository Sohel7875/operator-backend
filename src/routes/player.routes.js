import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as wallet from '../services/wallet.service.js';
import { launch, fetchGames } from '../aggregatorClient.js';

// Frontend-facing API.
const router = express.Router();

/**
 * PUBLIC — game catalog = whatever the aggregator has APPROVED for this operator.
 * Never hardcoded; the operator backend signs the call. Browsable without login so
 * players can see the lobby; launching still requires auth (below).
 */
router.get('/games', async (req, res) => {
  try {
    const games = await fetchGames();
    res.json(games); // [{ game_code, name, provider, rtp, thumbnail, ... }]
  } catch (err) {
    console.error('games fetch error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Everything below requires a logged-in player (JWT). ──
router.use(requireAuth);

router.get('/me', async (req, res) => {
  const bal = await wallet.getBalance(req.userId);
  res.json({ id: req.userId, username: req.username, ...bal });
});

router.post('/deposit', async (req, res) => {
  try {
    const out = await wallet.deposit({ userId: req.userId, amount: Number(req.body?.amount) });
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/transactions', async (req, res) => {
  const txns = await wallet.getTransactions(req.userId, Number(req.query.limit) || 50);
  res.json(txns);
});

/** Launch a game for the logged-in player → operator signs + calls the aggregator. */
router.post('/launch', async (req, res) => {
  try {
    const { gameCode, currency } = req.body || {};
    if (!gameCode) return res.status(400).json({ error: 'gameCode required' });
    const out = await launch({ operatorPlayerId: req.userId, gameCode, currency });
    res.json(out); // { launchUrl, token, socketUrl, expiresIn }
  } catch (err) {
    console.error('launch error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

export default router;
