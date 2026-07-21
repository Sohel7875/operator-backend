import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { AdminUser, Wallet, GameHistory, UserMachine } from '../models.js';

const toOid = (id) => { try { return new mongoose.Types.ObjectId(String(id)); } catch { return null; } };
import { auth } from '../authMiddleware.js';
import { sendResponse } from '../respond.js';

const router = express.Router();
const pick = (obj = {}, keys) => keys.reduce((a, k) => (k in obj ? ((a[k] = obj[k]), a) : a), {});
const paginate = (total, page, limit) => ({ total, page, limit, totalPages: Math.ceil(total / limit) || 0 });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const HIDE = '-password -pin -deviceId -ip';

router.post('/list', auth(['admin', 'user']), wrap(async (req, res) => {
  const { page = 1, limit = 10, search, role, active, isEmailVerified, source, sort = 'createdAt', order = 'desc' } = req.body || {};
  const lim = Math.min(Math.max(Number(limit) || 10, 1), 200);
  const pg = Math.max(Number(page) || 1, 1);
  const query = { loginSource: 'PLATFORM' };
  if (search) query.$or = [{ email: { $regex: search, $options: 'i' } }, { username: { $regex: search, $options: 'i' } }];
  if (role !== undefined) query.role = role;
  if (active !== undefined) query.active = active;
  if (isEmailVerified !== undefined) query.isEmailVerified = isEmailVerified;
  if (source !== undefined) query.source = source;
  const [users, total] = await Promise.all([
    AdminUser.find(query).select(HIDE).sort({ [sort]: order === 'asc' ? 1 : -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    AdminUser.countDocuments(query),
  ]);
  sendResponse(res, 200, 'Users', { data: users, pagination: paginate(total, pg, lim) });
}));

router.post('/get-by-id', auth(['admin', 'user']), wrap(async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return sendResponse(res, 400, 'userId required', null);
  const [user, wallet, statsAgg, machinesCount] = await Promise.all([
    AdminUser.findById(userId).select(HIDE).lean(),
    Wallet.findOne({ userId }).lean(),
    GameHistory.aggregate([
      { $match: { userId: toOid(userId) } },
      { $group: { _id: null, rounds: { $sum: 1 }, bet: { $sum: '$history.bet' }, win: { $sum: '$history.win' }, lastPlayedAt: { $max: '$createdAt' } } },
    ]).catch(() => []),
    UserMachine.countDocuments({ userId }),
  ]);
  if (!user) return sendResponse(res, 404, 'User not found', null);
  const a = statsAgg?.[0] || {};
  const stats = { totalRounds: a.rounds || 0, totalBet: a.bet || 0, totalWin: a.win || 0, ggr: (a.bet || 0) - (a.win || 0), lastPlayedAt: a.lastPlayedAt || null, machinesCount };
  sendResponse(res, 200, 'User', { user, wallet, stats });
}));

router.post('/create', auth('admin'), wrap(async (req, res) => {
  const { email, username, password, role = 'user', isEmailVerified = true, initialBalance, initialBonusBalance } = req.body || {};
  if (!email || !username || !password) return sendResponse(res, 400, 'email, username and password required', null);
  const existing = await AdminUser.findOne({ $or: [{ email: email.toLowerCase() }, { username }] }).lean();
  if (existing) return sendResponse(res, 409, 'email or username already exists', null);
  const hashed = await bcrypt.hash(password, 12);
  const user = await AdminUser.create({ email: email.toLowerCase(), username, password: hashed, role, isEmailVerified, isTemporaryUser: false, loginSource: 'PLATFORM', active: true });
  const walletPayload = { userId: user._id };
  if (initialBalance !== undefined) walletPayload.balance = initialBalance;
  if (initialBonusBalance !== undefined) walletPayload.bonusBalance = initialBonusBalance;
  const wallet = await Wallet.create(walletPayload);
  await AdminUser.updateOne({ _id: user._id }, { $set: { wallet: wallet._id } });
  const u = user.toObject(); delete u.password;
  sendResponse(res, 201, 'User created', { user: u, wallet: wallet.toObject() });
}));

router.post('/update', auth('admin'), wrap(async (req, res) => {
  const { userId, updates = {} } = req.body || {};
  if (!userId) return sendResponse(res, 400, 'userId required', null);
  const safe = pick(updates, ['username', 'email', 'role', 'active', 'isEmailVerified', 'isPhoneVerified', 'vipLevel', 'settings']);
  const updated = await AdminUser.findByIdAndUpdate(userId, { $set: safe }, { new: true, runValidators: true }).select(HIDE).lean();
  if (!updated) return sendResponse(res, 404, 'User not found', null);
  sendResponse(res, 200, 'User updated', { data: updated });
}));

router.post('/delete', auth('admin'), wrap(async (req, res) => {
  const { userId, hard = false } = req.body || {};
  if (!userId) return sendResponse(res, 400, 'userId required', null);
  if (!hard) await AdminUser.updateOne({ _id: userId }, { $set: { active: false } });
  else await Promise.all([AdminUser.deleteOne({ _id: userId }), Wallet.deleteOne({ userId }), UserMachine.deleteMany({ userId })]);
  sendResponse(res, 200, hard ? 'User deleted' : 'User deactivated', { data: { userId } });
}));

router.post('/block-unblock', auth('admin'), wrap(async (req, res) => {
  const { userId, action, reason } = req.body || {};
  if (!userId || !['block', 'unblock'].includes(action)) return sendResponse(res, 400, 'userId and valid action required', null);
  const target = await AdminUser.findOne({ _id: userId, loginSource: 'PLATFORM' });
  if (!target) return sendResponse(res, 404, 'User not found', null);
  let updates;
  if (action === 'block') {
    if (String(userId) === String(req.user?.id)) return sendResponse(res, 400, 'Cannot block your own account', null);
    const activeAdmins = await AdminUser.countDocuments({ loginSource: 'PLATFORM', role: 'admin', active: true, _id: { $ne: userId } });
    if (activeAdmins === 0 && target.role === 'admin') return sendResponse(res, 400, 'Cannot block the last active platform admin', null);
    updates = { active: false, blockReason: reason || null };
  } else {
    updates = { active: true, blockReason: null };
  }
  const updated = await AdminUser.findByIdAndUpdate(userId, { $set: updates }, { new: true }).select(HIDE).lean();
  sendResponse(res, 200, action === 'block' ? 'User blocked' : 'User unblocked', { data: updated });
}));

export default router;
