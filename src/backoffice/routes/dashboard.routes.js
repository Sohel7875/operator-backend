import express from 'express';
import mongoose from 'mongoose';
import { GameHistory } from '../models.js';
import { auth } from '../authMiddleware.js';
import { sendResponse } from '../respond.js';
import { resolveDateRange } from '../dateRange.js';

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const toOid = (id) => { try { return new mongoose.Types.ObjectId(String(id)); } catch { return null; } };
const PARENT_ROUND_TYPES = ['bet', 'premium_spin', 'buy_bonus'];
const roundsExpr = { $sum: { $cond: [{ $in: ['$history.roundType', PARENT_ROUND_TYPES] }, 1, 0] } };

function buildMatch({ start, end, gameId, roundType, userId }) {
  const m = { createdAt: { $gte: start, $lte: end } };
  if (gameId) { const o = toOid(gameId); if (o) m.gameId = o; }
  if (userId) { const o = toOid(userId); if (o) m.userId = o; }
  if (roundType) m['history.roundType'] = roundType;
  return m;
}

// ── time-series insights ──
router.post('/insights', auth(['admin', 'user']), wrap(async (req, res) => {
  const { gameId, granularity = 'day' } = req.body || {};
  const { start, end, mongoTz } = resolveDateRange(req.body);
  const series = await GameHistory.aggregate([
    { $match: buildMatch({ start, end, gameId }) },
    {
      $group: {
        _id: { $dateTrunc: { date: '$createdAt', unit: granularity, timezone: mongoTz } },
        rounds: roundsExpr,
        bet: { $sum: '$history.bet' },
        win: { $sum: '$history.win' },
        players: { $addToSet: '$userId' },
      },
    },
    {
      $project: {
        _id: 0, bucket: '$_id', rounds: 1, bet: 1, win: 1,
        ggr: { $subtract: ['$bet', '$win'] },
        rtp: { $cond: [{ $eq: ['$bet', 0] }, 0, { $multiply: [{ $divide: ['$win', '$bet'] }, 100] }] },
        uniquePlayers: { $size: '$players' },
      },
    },
    { $sort: { bucket: 1 } },
  ]);
  sendResponse(res, 200, 'Insights', { series });
}));

// ── paginated game-history (professional data) ──
router.post('/professional-data', auth(['admin', 'user']), wrap(async (req, res) => {
  const { gameId, roundType, search, page = 1, limit = 10, sort = 'createdAt', order = 'desc' } = req.body || {};
  const { start, end } = resolveDateRange(req.body);
  const lim = Math.min(Math.max(Number(limit) || 10, 1), 200);
  const pg = Math.max(Number(page) || 1, 1);

  const pipeline = [
    { $match: buildMatch({ start, end, gameId, roundType }) },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user', pipeline: [{ $project: { username: 1, email: 1 } }] } },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'games', localField: 'gameId', foreignField: '_id', as: 'game', pipeline: [{ $project: { name: 1, game_code: 1 } }] } },
    { $unwind: { path: '$game', preserveNullAndEmptyArrays: true } },
  ];
  if (search) {
    pipeline.push({ $match: { $or: [{ 'user.username': { $regex: search, $options: 'i' } }, { 'user.email': { $regex: search, $options: 'i' } }] } });
  }
  pipeline.push(
    { $project: { _id: 1, createdAt: 1, history: 1, user: { _id: '$user._id', username: '$user.username', email: '$user.email' }, game: { _id: '$game._id', name: '$game.name', game_code: '$game.game_code' } } },
    { $facet: { data: [{ $sort: { [sort]: order === 'asc' ? 1 : -1 } }, { $skip: (pg - 1) * lim }, { $limit: lim }], meta: [{ $count: 'total' }] } }
  );
  const [result] = await GameHistory.aggregate(pipeline);
  const total = result?.meta?.[0]?.total || 0;
  sendResponse(res, 200, 'Professional data', { data: result?.data || [], pagination: { total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) || 0 } });
}));

// ── platform performance summary ──
router.post('/platform-performance', auth(['admin', 'user']), wrap(async (req, res) => {
  const { gameId } = req.body || {};
  const { start, end, days, tz } = resolveDateRange(req.body);
  const [agg] = await GameHistory.aggregate([
    { $match: buildMatch({ start, end, gameId }) },
    { $group: { _id: null, rounds: roundsExpr, totalBet: { $sum: '$history.bet' }, totalWin: { $sum: '$history.win' }, playerSet: { $addToSet: '$userId' } } },
    { $project: { _id: 0, rounds: 1, totalBet: 1, totalWin: 1, uniquePlayers: { $size: '$playerSet' } } },
  ]);
  const rounds = agg?.rounds || 0;
  const totalBet = agg?.totalBet || 0;
  const totalWin = agg?.totalWin || 0;
  const totalGGR = totalBet - totalWin;
  sendResponse(res, 200, 'Platform performance', {
    rounds, totalBet, totalWin, totalGGR,
    averageBet: rounds > 0 ? totalBet / rounds : 0,
    dailyAverageGGR: days > 0 ? totalGGR / days : 0,
    overallRTP: totalBet > 0 ? (totalWin / totalBet) * 100 : 0,
    ngr6: totalGGR * 0.94,
    uniquePlayers: agg?.uniquePlayers || 0,
    range: { start, end, tz, days },
  });
}));

// ── revenue report (group by game / day / currency) ──
router.post('/revenue-report', auth(['admin', 'user']), wrap(async (req, res) => {
  const { gameId, groupBy = 'game' } = req.body || {};
  const { start, end, mongoTz } = resolveDateRange(req.body);
  const match = buildMatch({ start, end, gameId });
  let pipeline;

  if (groupBy === 'day') {
    pipeline = [
      { $match: match },
      { $group: { _id: { $dateTrunc: { date: '$createdAt', unit: 'day', timezone: mongoTz } }, rounds: roundsExpr, totalBet: { $sum: '$history.bet' }, totalWin: { $sum: '$history.win' } } },
      { $project: { _id: 0, key: { day: '$_id' }, rounds: 1, totalBet: 1, totalWin: 1, ggr: { $subtract: ['$totalBet', '$totalWin'] }, rtp: { $cond: [{ $eq: ['$totalBet', 0] }, 0, { $multiply: [{ $divide: ['$totalWin', '$totalBet'] }, 100] }] } } },
      { $sort: { 'key.day': 1 } },
    ];
  } else if (groupBy === 'currency') {
    pipeline = [
      { $match: match },
      { $lookup: { from: 'wallets', localField: 'userId', foreignField: 'userId', as: 'wallet', pipeline: [{ $project: { currency: 1 } }] } },
      { $unwind: { path: '$wallet', preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $ifNull: ['$wallet.currency', 'unknown'] }, rounds: roundsExpr, totalBet: { $sum: '$history.bet' }, totalWin: { $sum: '$history.win' } } },
      { $project: { _id: 0, key: { currency: '$_id' }, rounds: 1, totalBet: 1, totalWin: 1, ggr: { $subtract: ['$totalBet', '$totalWin'] }, rtp: { $cond: [{ $eq: ['$totalBet', 0] }, 0, { $multiply: [{ $divide: ['$totalWin', '$totalBet'] }, 100] }] } } },
      { $sort: { rounds: -1 } },
    ];
  } else {
    pipeline = [
      { $match: match },
      { $group: { _id: '$gameId', rounds: roundsExpr, totalBet: { $sum: '$history.bet' }, totalWin: { $sum: '$history.win' } } },
      { $lookup: { from: 'games', localField: '_id', foreignField: '_id', as: 'game', pipeline: [{ $project: { name: 1, game_code: 1 } }] } },
      { $unwind: { path: '$game', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, key: { gameId: '$_id', name: '$game.name', game_code: '$game.game_code' }, rounds: 1, totalBet: 1, totalWin: 1, ggr: { $subtract: ['$totalBet', '$totalWin'] }, rtp: { $cond: [{ $eq: ['$totalBet', 0] }, 0, { $multiply: [{ $divide: ['$totalWin', '$totalBet'] }, 100] }] } } },
      { $sort: { rounds: -1 } },
    ];
  }

  const rows = await GameHistory.aggregate(pipeline);
  const totals = rows.reduce((a, r) => ({ rounds: a.rounds + r.rounds, totalBet: a.totalBet + r.totalBet, totalWin: a.totalWin + r.totalWin }), { rounds: 0, totalBet: 0, totalWin: 0 });
  totals.ggr = totals.totalBet - totals.totalWin;
  totals.rtp = totals.totalBet > 0 ? (totals.totalWin / totals.totalBet) * 100 : 0;
  sendResponse(res, 200, 'Revenue report', { rows, totals });
}));

export default router;
