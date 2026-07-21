import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import User from '../models/user.model.js';
import Wallet from '../models/wallet.model.js';
import WalletTransaction from '../models/walletTxn.model.js';

function signToken(user) {
  return jwt.sign({ sub: String(user._id), username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export async function signup({ username, email, password }) {
  if (!username || !email || !password) throw new Error('username, email and password required');
  if (password.length < 6) throw new Error('password must be at least 6 characters');

  const exists = await User.findOne({ $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] }).lean();
  if (exists) throw new Error('username or email already taken');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ username, email, passwordHash });

  await Wallet.create({ userId: user._id, balance: config.signupBonus, currency: config.currency });
  if (config.signupBonus > 0) {
    await WalletTransaction.create({
      userId: user._id,
      txnId: `signup:${user._id}`,
      type: 'deposit',
      amount: config.signupBonus,
      status: 'success',
      balanceAfter: config.signupBonus,
    });
  }

  return { token: signToken(user), user: { id: user._id, username: user.username, email: user.email } };
}

export async function login({ usernameOrEmail, password }) {
  if (!usernameOrEmail || !password) throw new Error('credentials required');
  const id = usernameOrEmail.toLowerCase();
  const user = await User.findOne({ $or: [{ username: id }, { email: id }] });
  if (!user) throw new Error('invalid credentials');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error('invalid credentials');

  return { token: signToken(user), user: { id: user._id, username: user.username, email: user.email } };
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export default { signup, login, verifyToken };
