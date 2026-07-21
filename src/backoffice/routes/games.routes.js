import express from 'express';
import { Game, Bet, Bonus, Counter, GameHistory, UserMachine } from '../models.js';
import { auth } from '../authMiddleware.js';
import { sendResponse } from '../respond.js';

const router = express.Router();
const pick = (obj = {}, keys) => keys.reduce((a, k) => (k in obj ? ((a[k] = obj[k]), a) : a), {});
const paginate = (total, page, limit) => ({ total, page, limit, totalPages: Math.ceil(total / limit) || 0 });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ALLOWED_UPDATE_KEYS = [
  'name', 'description', 'isActive', 'gamePoster', 'minBet', 'maxBet', 'rtp', 'volatility',
  'coin_multiplier', 'premium_coin_multiplier', 'bonus_coin_multiplier', 'jackpot',
  'reels', 'rows', 'layout', 'symbols', 'bonusFeatures', 'clientUrl',
];

router.post('/list', auth(['admin', 'user']), wrap(async (req, res) => {
  const { page = 1, limit = 10, search, isActive, volatility, sort = 'createdAt', order = 'desc' } = req.body || {};
  const lim = Math.min(Math.max(Number(limit) || 10, 1), 200);
  const pg = Math.max(Number(page) || 1, 1);
  const query = {};
  if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { game_code: { $regex: search, $options: 'i' } }];
  if (isActive !== undefined) query.isActive = isActive;
  if (volatility !== undefined) query.volatility = volatility;
  const [games, total] = await Promise.all([
    Game.find(query).sort({ [sort]: order === 'asc' ? 1 : -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    Game.countDocuments(query),
  ]);
  sendResponse(res, 200, 'Games', { data: games, pagination: paginate(total, pg, lim) });
}));

router.post('/get-by-id', auth(['admin', 'user']), wrap(async (req, res) => {
  const { gameId } = req.body || {};
  if (!gameId) return sendResponse(res, 400, 'gameId required', null);
  const game = await Game.findById(gameId).lean();
  if (!game) return sendResponse(res, 404, 'Game not found', null);
  const [totalRounds, activeMachines, bonuses] = await Promise.all([
    GameHistory.countDocuments({ gameId }),
    UserMachine.countDocuments({ gameId }),
    Bonus.countDocuments({ gameId }),
  ]);
  sendResponse(res, 200, 'Game', { game, counts: { totalRounds, activeMachines, bonuses } });
}));

router.post('/add-game', auth('admin'), wrap(async (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.game_code) return sendResponse(res, 400, 'name and game_code required', null);
  const exists = await Game.findOne({ $or: [{ name: body.name }, { game_code: body.game_code }] }).lean();
  if (exists) return sendResponse(res, 409, 'Game name or code already exists', null);
  const game = await Game.create(body);
  await Counter.updateOne(
    { game_code: body.game_code },
    { $setOnInsert: { game_code: body.game_code, codePrefix: body.codePrefix || '', game_counter: 0 } },
    { upsert: true }
  );
  sendResponse(res, 201, 'Game created', { data: game.toObject() });
}));

router.post('/update', auth('admin'), wrap(async (req, res) => {
  const { gameId, updates = {} } = req.body || {};
  if (!gameId) return sendResponse(res, 400, 'gameId required', null);
  const safe = pick(updates, ALLOWED_UPDATE_KEYS);
  const ops = { $set: safe };
  if (safe.layout) ops.$unset = { reels: '', rows: '' };
  else if (safe.reels || safe.rows) ops.$unset = { layout: '' };
  const updated = await Game.findByIdAndUpdate(gameId, ops, { new: true, runValidators: true }).lean();
  if (!updated) return sendResponse(res, 404, 'Game not found', null);
  sendResponse(res, 200, 'Game updated', { data: updated });
}));

router.post('/delete', auth('admin'), wrap(async (req, res) => {
  const { gameId, hard = false } = req.body || {};
  if (!gameId) return sendResponse(res, 400, 'gameId required', null);
  const game = await Game.findById(gameId).lean();
  if (!game) return sendResponse(res, 404, 'Game not found', null);
  if (!hard) {
    await Game.updateOne({ _id: gameId }, { $set: { isActive: false } });
  } else {
    await Promise.all([
      Game.deleteOne({ _id: gameId }),
      Bet.deleteMany({ gameId }),
      Bonus.deleteMany({ gameId }),
      UserMachine.deleteMany({ gameId }),
      Counter.deleteOne({ game_code: game.game_code }),
    ]);
  }
  sendResponse(res, 200, hard ? 'Game deleted' : 'Game deactivated', { data: { gameId } });
}));

async function readConfig(game) {
  const [bet, bonuses, counter] = await Promise.all([
    Bet.findOne({ gameId: game._id }).lean(),
    Bonus.find({ gameId: game._id }).lean(),
    Counter.findOne({ game_code: game.game_code }).lean(),
  ]);
  return { game, bet, bonuses, counter };
}

router.post('/config/get', auth(['admin', 'user']), wrap(async (req, res) => {
  const { gameId } = req.body || {};
  const game = await Game.findById(gameId).lean();
  if (!game) return sendResponse(res, 404, 'Game not found', null);
  sendResponse(res, 200, 'Game config', await readConfig(game));
}));

router.post('/config/update', auth('admin'), wrap(async (req, res) => {
  const { gameId, gameUpdates, betUpdates, counterUpdates } = req.body || {};
  const game = await Game.findById(gameId);
  if (!game) return sendResponse(res, 404, 'Game not found', null);

  if (gameUpdates) {
    const safe = pick(gameUpdates, ['rtp', 'volatility', 'minBet', 'maxBet', 'coin_multiplier']);
    await Game.findByIdAndUpdate(gameId, { $set: safe }, { new: true });
  }
  if (betUpdates) {
    const set = {};
    if (Array.isArray(betUpdates.betValues) && betUpdates.betValues.length) {
      set.betValues = Array.from(new Set(betUpdates.betValues));
      set.betSize = undefined; set.betLevel = undefined;
    } else {
      if (betUpdates.betSize) set.betSize = betUpdates.betSize;
      if (betUpdates.betLevel) set.betLevel = betUpdates.betLevel;
      set.betValues = undefined;
    }
    await Bet.updateOne({ gameId }, { $set: set }, { upsert: true });
  }
  if (counterUpdates?.codePrefix) {
    await Counter.updateOne({ game_code: game.game_code }, { $set: { codePrefix: counterUpdates.codePrefix } }, { upsert: true });
  }
  const fresh = await Game.findById(gameId).lean();
  sendResponse(res, 200, 'Game config updated', await readConfig(fresh));
}));

export default router;
