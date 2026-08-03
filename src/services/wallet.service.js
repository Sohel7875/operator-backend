import crypto from 'crypto';
import Wallet from '../models/wallet.model.js';
import WalletTransaction from '../models/walletTxn.model.js';

// Money is 2-decimal. Mongo `$inc` on floats accumulates binary-float error
// (e.g. 10375.039999999995); round the balance after every write so what we
// store and return is clean, and the withdraw/bet guards compare exact values.
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Persist the rounded balance if the atomic $inc left a drifted value. Keeps the
// stored number equal to what we return, so `$gte` guards line up next time.
async function settle(userId, balance) {
  const r = round2(balance);
  if (r !== balance) await Wallet.updateOne({ userId }, { $set: { balance: r } });
  return r;
}

async function balanceOf(userId) {
  const w = await Wallet.findOne({ userId }).lean();
  return w ? round2(w.balance) : 0;
}

export async function getBalance(userId) {
  const w = await Wallet.findOne({ userId }).lean();
  return { balance: round2(w?.balance ?? 0), currency: w?.currency ?? 'USD' };
}

/** Debit a bet. Reserves idempotency first, then debits only if funds suffice. */
export async function bet({ userId, amount, txnId, roundId, gameCode }) {
  // 1. Reserve the txn (unique txnId). Duplicate => return prior outcome.
  try {
    await WalletTransaction.create({ userId, txnId, type: 'bet', amount, roundId, gameCode, status: 'pending' });
  } catch (err) {
    if (err.code === 11000) {
      const ex = await WalletTransaction.findOne({ txnId }).lean();
      return { ok: ex?.status === 'success', insufficient: ex?.status === 'failed', balance: ex?.balanceAfter ?? (await balanceOf(userId)), duplicate: true };
    }
    throw err;
  }

  // 2. Atomic debit, only if balance is sufficient.
  const wallet = await Wallet.findOneAndUpdate(
    { userId, balance: { $gte: amount } },
    { $inc: { balance: -amount, totalBet: amount } },
    { new: true }
  );
  if (!wallet) {
    await WalletTransaction.updateOne({ txnId }, { status: 'failed' });
    return { ok: false, insufficient: true, balance: await balanceOf(userId) };
  }

  const bal = await settle(userId, wallet.balance);
  await WalletTransaction.updateOne({ txnId }, { status: 'success', balanceAfter: bal });
  return { ok: true, balance: bal };
}

/** Credit a win. Idempotent by txnId. */
export async function win({ userId, amount, txnId, roundId, gameCode }) {
  try {
    await WalletTransaction.create({ userId, txnId, type: 'win', amount: Number(amount || 0), roundId, gameCode, status: 'pending' });
  } catch (err) {
    if (err.code === 11000) {
      const ex = await WalletTransaction.findOne({ txnId }).lean();
      return { ok: true, balance: ex?.balanceAfter ?? (await balanceOf(userId)), duplicate: true };
    }
    throw err;
  }

  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: Number(amount || 0), totalWon: Number(amount || 0) } },
    { new: true }
  );
  const bal = await settle(userId, wallet.balance);
  await WalletTransaction.updateOne({ txnId }, { status: 'success', balanceAfter: bal });
  return { ok: true, balance: bal };
}

/** Reverse a bet identified by its original txnId. Idempotent. */
export async function rollback({ userId, txnId }) {
  const rbId = `${txnId}:rb`;
  try {
    await WalletTransaction.create({ userId, txnId: rbId, type: 'rollback', amount: 0, refOf: txnId, status: 'pending' });
  } catch (err) {
    if (err.code === 11000) {
      const ex = await WalletTransaction.findOne({ txnId: rbId }).lean();
      return { ok: true, balance: ex?.balanceAfter ?? (await balanceOf(userId)), duplicate: true };
    }
    throw err;
  }

  const betTxn = await WalletTransaction.findOne({ txnId }).lean();
  let balance;
  if (betTxn && betTxn.type === 'bet' && betTxn.status === 'success') {
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { balance: betTxn.amount, totalBet: -betTxn.amount } },
      { new: true }
    );
    balance = wallet.balance;
  } else {
    balance = await balanceOf(userId);
  }
  await WalletTransaction.updateOne({ txnId: rbId }, { status: 'success', amount: betTxn?.amount || 0, balanceAfter: balance });
  return { ok: true, balance };
}

/** Player deposit (real cash in). */
export async function deposit({ userId, amount }) {
  const amt = round2(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');
  const txnId = `dep:${crypto.randomBytes(8).toString('hex')}`;
  await WalletTransaction.create({ userId, txnId, type: 'deposit', amount: amt, status: 'pending' });
  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: amt, totalDeposited: amt } },
    { new: true }
  );
  const bal = await settle(userId, wallet.balance);
  await WalletTransaction.updateOne({ txnId }, { status: 'success', balanceAfter: bal });
  return { balance: bal, currency: wallet.currency };
}

/**
 * Player withdrawal (cash out). Reduces the balance by `amount`; pass amount ===
 * current balance (or 'all') to drain the wallet to 0 for testing. Never lets the
 * balance go negative — the atomic guard only debits if funds suffice.
 */
export async function withdraw({ userId, amount }) {
  // Clean any stored float drift FIRST, so the $gte guard and 'all' use exact,
  // rounded values (otherwise a guard of 10375.04 fails against a stored 10375.0399…).
  const w0 = await Wallet.findOne({ userId }).lean();
  const current = w0 ? await settle(userId, w0.balance) : 0;
  const amt = amount === 'all' ? current : round2(amount);
  if (!(amt > 0)) throw new Error('amount must be > 0');
  if (amt > current) throw new Error('amount exceeds balance');

  const txnId = `wd:${crypto.randomBytes(8).toString('hex')}`;
  await WalletTransaction.create({ userId, txnId, type: 'withdraw', amount: amt, status: 'pending' });
  const wallet = await Wallet.findOneAndUpdate(
    { userId, balance: { $gte: amt } },
    { $inc: { balance: -amt } },
    { new: true }
  );
  if (!wallet) {
    await WalletTransaction.updateOne({ txnId }, { status: 'failed' });
    throw new Error('amount exceeds balance');
  }
  const bal = await settle(userId, wallet.balance);
  await WalletTransaction.updateOne({ txnId }, { status: 'success', balanceAfter: bal });
  return { balance: bal, currency: wallet.currency };
}

export async function getTransactions(userId, limit = 50) {
  return WalletTransaction.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

export default { getBalance, bet, win, rollback, deposit, withdraw, getTransactions };
