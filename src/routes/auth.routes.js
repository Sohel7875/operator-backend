import express from 'express';
import * as auth from '../services/auth.service.js';

const router = express.Router();

router.post('/signup', async (req, res) => {
  try {
    const out = await auth.signup(req.body || {});
    res.status(201).json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const out = await auth.login(req.body || {});
    res.json(out);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

export default router;
