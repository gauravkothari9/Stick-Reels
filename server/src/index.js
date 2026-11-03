import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { config, MEDIA_DIR, ROOT } from './config.js';
import { Job } from './models/Job.js';
import admin from './routes/admin.js';
import api from './routes/api.js';
import auth from './routes/auth.js';
import billing, { webhook } from './routes/billing.js';
import music from './routes/music.js';
import schedules from './routes/schedules.js';
import { loadUser, requireAuth } from './services/auth.js';
import { migrate } from './services/migrate.js';
import { loadPlanOverrides } from './services/plans.js';
import { startQueue } from './services/queue.js';
import { startScheduler } from './services/scheduler.js';

const app = express();
app.set('trust proxy', config.trustProxyHops); // real client IPs (for rate limiting) behind Caddy / Vercel
app.disable('x-powered-by');
if (config.clientUrl) app.use(cors({ origin: config.clientUrl, credentials: true }));

// Razorpay webhook needs the raw body, so it goes before the JSON parser.
app.post('/api/billing/webhook', ...webhook);

app.use(express.json({ limit: '1mb' }));
// API answers are per-user: never let a CDN (e.g. Vercel's rewrite cache) store them.
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(loadUser);

// --- media ----------------------------------------------------------------------
// Style previews and mood samples are public; users' own Shorts and music are private.
const staticOpts = { maxAge: '1h', fallthrough: false };
app.use('/media/previews', express.static(path.join(MEDIA_DIR, 'previews'), staticOpts));
app.use('/media/music-samples', express.static(path.join(MEDIA_DIR, 'music-samples'), staticOpts));

app.get('/media/videos/:file', requireAuth, async (req, res, next) => {
  try {
    const rel = `videos/${path.basename(req.params.file)}`;
    const owns = await Job.exists({ userId: req.user._id, $or: [{ video: rel }, { thumbnail: rel }] });
    if (!owns && req.user.role !== 'admin') return res.status(404).end();
    res.sendFile(path.join(MEDIA_DIR, rel), { maxAge: '1h' }, (err) => err && !res.headersSent && res.status(404).end());
  } catch (err) {
    next(err);
  }
});

app.get('/media/music/:userId/:file', requireAuth, (req, res) => {
  if (req.params.userId !== req.user.id && req.user.role !== 'admin') return res.status(404).end();
  const file = path.join(MEDIA_DIR, 'music', path.basename(req.params.userId), path.basename(req.params.file));
  res.sendFile(file, (err) => err && !res.headersSent && res.status(404).end());
});
app.use('/media', (_req, res) => res.status(404).end());

// --- API ----------------------------------------------------------------------------
app.use('/api/admin', admin);
app.use('/api/auth', auth);
app.use('/api/billing', billing);
app.use('/api/music', music);
app.use('/api/schedules', schedules);
app.use('/api', api);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built React app (npm run build in client/)
const dist = path.join(ROOT, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|media).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  // API-only deployment (frontend on Vercel)
  app.get('/', (_req, res) => res.json({ name: 'Stick Reels API', ok: true }));
}

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status < 500 || err.expose ? err.message : 'Something went wrong on our side' });
});

await mongoose.connect(config.mongoUri);
await migrate();
await loadPlanOverrides();
fs.mkdirSync(path.join(MEDIA_DIR, 'videos'), { recursive: true });
fs.mkdirSync(path.join(MEDIA_DIR, 'previews'), { recursive: true });
fs.mkdirSync(path.join(MEDIA_DIR, 'music'), { recursive: true });
await startQueue();
await startScheduler();
app.listen(config.port, config.host, () => console.log(`Stick Reels API on http://localhost:${config.port}`));
