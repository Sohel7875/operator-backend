import express from 'express';
import bcrypt from 'bcryptjs';
import { AdminUser } from '../models.js';
import { generateToken } from '../token.service.js';
import { respondFromService } from '../respond.js';

const router = express.Router();

async function loginUser({ email, username, password, source }) {
  if (!password) return { status: false, code: 400, msg: "The 'password' field is required." };

  let where;
  if (email) where = { email: String(email).toLowerCase().trim() };
  else if (username) where = { username: String(username).trim() };
  else return { status: false, code: 400, msg: "Either 'email' or 'username' is required." };

  const user = await AdminUser.findOne(where);
  if (!user) return { status: false, code: 404, msg: `User ${email || username} not found` };
  if (user.isTemporaryUser) return { status: false, code: 403, msg: 'Please complete your registration to proceed.' };

  const ok = await bcrypt.compare(password, user.password || '');
  if (!ok) return { status: false, code: 401, msg: 'Invalid password. Please check your credentials.' };

  if (source && user.loginSource && user.loginSource !== source) {
    return { status: false, code: 403, msg: 'You are not authorized to login from this source' };
  }
  if (user.active === false) return { status: false, code: 403, msg: 'Your account has been blocked' };

  await AdminUser.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
  const { access_token, refresh_token } = generateToken(user._id, user.role);

  const u = user.toObject();
  delete u.password;
  return { status: true, code: 200, data: { msg: 'Login successful', user: { ...u, access_token, refresh_token } } };
}

router.post('/login', async (req, res, next) => {
  try {
    const { email, username, password, source = 'APP' } = req.body || {};
    const result = await loginUser({ email, username, password, source });
    return respondFromService(res, result, 'Login successful');
  } catch (err) {
    next(err);
  }
});

export default router;
