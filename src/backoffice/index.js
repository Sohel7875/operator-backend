import express from 'express';
import authRoutes from './routes/auth.routes.js';
import gamesRoutes from './routes/games.routes.js';
import usersRoutes from './routes/users.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import reportsRoutes from './routes/reports.routes.js';

// Backoffice admin API ported from slot-rc-duckhunt. Mount under /v1.
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/games', gamesRoutes);
router.use('/users', usersRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportsRoutes);

export default router;
