import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import walletRoutes from './walletRoutes.js';
import authRoutes from './routes/auth.routes.js';
import playerRoutes from './routes/player.routes.js';
import backofficeRoutes from './backoffice/index.js';

const app = express();
app.use(cors({ origin: '*' }));

// Capture raw body so wallet-call signatures verify byte-for-byte.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

// Public health check — safe to hit from a browser. Reports whether Mongo is
// actually connected (readyState 1), so a green page = DB is up, not just the
// process. Returns 503 if Mongo is down so uptime monitors can catch it.
app.get('/health', (req, res) => {
  const mongoUp = mongoose.connection?.readyState === 1;
  res.status(mongoUp ? 200 : 503).json({
    ok: mongoUp,
    service: 'operator-backend',
    mongo: mongoUp ? 'connected' : 'down',
    uptimeSec: Math.floor(process.uptime()),
    time: new Date().toISOString(),
  });
});

// Backoffice admin API (ported from slot-rc-duckhunt) — what tmt-backoffice calls
app.use('/v1', backofficeRoutes);

// Frontend-facing (player)
app.use('/api/auth', authRoutes); // signup / login (public)
app.use('/api', playerRoutes); // me / deposit / transactions / launch (JWT)

// Aggregator-facing wallet (root: /bet, /win, /balance, /rollback; signed)
app.use('/', walletRoutes);

// JSON error handler so the backoffice always gets { status, message, data }
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ status, message: err.message || 'Internal server error', data: null });
});

export default app;
