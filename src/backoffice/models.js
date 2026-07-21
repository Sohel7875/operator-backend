import mongoose from 'mongoose';
import conn from './db.js';

/**
 * Backoffice models — map to the SAME collections slot-rc-duckhunt uses
 * (Game / User / Wallet / gameHistory / Bet / SlotGameCounter / bonus), bound to
 * the dedicated backoffice connection (see db.js).
 *
 * Queryable fields are declared explicitly (strictQuery would otherwise strip
 * undeclared filter paths); strict:false passes every other stored field through.
 */
const opts = { strict: false, timestamps: true };
const model = (name, schema, collection) =>
  conn.models[name] || conn.model(name, schema, collection);

const adminUserSchema = new mongoose.Schema(
  {
    email: String, username: String, password: String,
    role: String, loginSource: String, source: String,
    active: Boolean, isEmailVerified: Boolean, isPhoneVerified: Boolean,
    isTemporaryUser: Boolean, isTwoFactorEnabled: Boolean,
    vipLevel: Number, blockReason: String, lastLogin: Date,
    wallet: mongoose.Schema.Types.ObjectId,
    settings: { soundOn: Boolean, musicOn: Boolean, language: String },
  },
  opts
);

const gameSchema = new mongoose.Schema(
  {
    name: String, game_code: String, codePrefix: String,
    coin_multiplier: Number, premium_coin_multiplier: Number, bonus_coin_multiplier: Number,
    gamePoster: String, reels: Number, rows: Number, layout: [Number],
    symbols: Array, bonusFeatures: Array,
    minBet: Number, maxBet: Number, jackpot: Number,
    rtp: Number, volatility: String, isActive: Boolean,
    createdBy: mongoose.Schema.Types.ObjectId,
  },
  opts
);

const walletSchema = new mongoose.Schema(
  { userId: mongoose.Schema.Types.ObjectId, balance: Number, bonusBalance: Number, currency: String },
  opts
);

const gameHistorySchema = new mongoose.Schema(
  {
    gameId: mongoose.Schema.Types.ObjectId,
    userId: mongoose.Schema.Types.ObjectId,
    history: mongoose.Schema.Types.Mixed,
  },
  opts
);

const betSchema = new mongoose.Schema(
  { gameId: mongoose.Schema.Types.ObjectId, betValues: [Number], betSize: [Number], betLevel: [Number] },
  opts
);

const counterSchema = new mongoose.Schema(
  { game_code: String, codePrefix: String, game_counter: Number },
  opts
);

const bonusSchema = new mongoose.Schema(
  { gameId: mongoose.Schema.Types.ObjectId, type: String, basePrice: Number, poster: String, bonusPlayId: String },
  opts
);

const userMachineSchema = new mongoose.Schema(
  { userId: mongoose.Schema.Types.ObjectId, gameId: mongoose.Schema.Types.ObjectId },
  opts
);

// Real collections in slot-machines are lowercase-plural (mongoose defaults).
export const AdminUser = model('BoUser', adminUserSchema, 'users');
export const Game = model('BoGame', gameSchema, 'games');
export const Wallet = model('BoWallet', walletSchema, 'wallets');
export const GameHistory = model('BoGameHistory', gameHistorySchema, 'gamehistories');
export const Bet = model('BoBet', betSchema, 'bets');
export const Counter = model('BoCounter', counterSchema, 'slotgamecounters');
export const Bonus = model('BoBonus', bonusSchema, 'bonus');
export const UserMachine = model('BoUserMachine', userMachineSchema, 'userslotmachines');

export default { AdminUser, Game, Wallet, GameHistory, Bet, Counter, Bonus, UserMachine };
