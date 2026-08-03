import crypto from 'crypto';
import Wallet from '../models/wallet.model.js';
import WalletTransaction from '../models/walletTxn.model.js';

async function balanceOf(userId) {
  const w = await Wallet.findOne({ userId }).lean();
  return w ? w.balance : 0;
}

export async function getBalance(userId) {
  const w = await Wallet.findOne({ userId }).lean();
  return { balance: w?.balance ?? 0, currency: w?.currency ?? 'USD' };
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

  await WalletTransaction.updateOne({ txnId }, { status: 'success', balanceAfter: wallet.balance });
  return { ok: true, balance: wallet.balance };
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
  await WalletTransaction.updateOne({ txnId }, { status: 'success', balanceAfter: wallet.balance });
  return { ok: true, balance: wallet.balance };
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
  if (!(amount > 0)) throw new Error('amount must be > 0');
  const txnId = `dep:${crypto.randomBytes(8).toString('hex')}`;
  await WalletTransaction.create({ userId, txnId, type: 'deposit', amount, status: 'pending' });
  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: amount, totalDeposited: amount } },
    { new: true }
  );
  await WalletTransaction.updateOne({ txnId }, { status: 'success', balanceAfter: wallet.balance });
  return { balance: wallet.balance, currency: wallet.currency };
}

/**
 * Player withdrawal (cash out). Reduces the balance by `amount`; pass amount ===
 * current balance (or 'all') to drain the wallet to 0 for testing. Never lets the
 * balance go negative — the atomic guard only debits if funds suffice.
 */
export async function withdraw({ userId, amount }) {
  const current = await balanceOf(userId);
  const amt = amount === 'all' ? current : Number(amount);
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
  await WalletTransaction.updateOne({ txnId }, { status: 'success', balanceAfter: wallet.balance });
  return { balance: wallet.balance, currency: wallet.currency };
}

export async function getTransactions(userId, limit = 50) {
  return WalletTransaction.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

export default { getBalance, bet, win, rollback, deposit, withdraw, getTransactions };
