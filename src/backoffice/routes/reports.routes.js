import express from 'express';
import mongoose from 'mongoose';
import { GameHistory } from '../models.js';
import { auth } from '../authMiddleware.js';
import { sendResponse } from '../respond.js';
import { resolveDateRange } from '../dateRange.js';

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const toOid = (id) => { try { return new mongoose.Types.ObjectId(String(id)); } catch { return null; } };

router.post('/revenue-records', auth(['admin', 'user']), wrap(async (req, res) => {
  const { gameId, userId, roundType, page = 1, limit = 10 } = req.body || {};
  const { start, end } = resolveDateRange(req.body);
  const lim = Math.min(Math.max(Number(limit) || 10, 1), 200);
  const pg = Math.max(Number(page) || 1, 1);

  const match = { createdAt: { $gte: start, $lte: end } };
  if (gameId) { const o = toOid(gameId); if (o) match.gameId = o; }
  if (userId) { const o = toOid(userId); if (o) match.userId = o; }
  if (roundType) match['history.roundType'] = roundType;

  const [result] = await GameHistory.aggregate([
    { $match: match },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user', pipeline: [{ $project: { username: 1, email: 1 } }] } },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'games', localField: 'gameId', foreignField: '_id', as: 'game', pipeline: [{ $project: { name: 1, game_code: 1 } }] } },
    { $unwind: { path: '$game', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 1, createdAt: 1, history: 1, user: { _id: '$user._id', username: '$user.username', email: '$user.email' }, game: { _id: '$game._id', name: '$game.name', game_code: '$game.game_code' } } },
    { $facet: { data: [{ $sort: { createdAt: -1 } }, { $skip: (pg - 1) * lim }, { $limit: lim }], meta: [{ $count: 'total' }] } },
  ]);
  const total = result?.meta?.[0]?.total || 0;
  sendResponse(res, 200, 'Revenue records', { data: result?.data || [], pagination: { total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) || 0 } });
}));

export default router;
