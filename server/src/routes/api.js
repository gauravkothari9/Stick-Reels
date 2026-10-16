import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { config, MEDIA_DIR } from '../config.js';
import { Job } from '../models/Job.js';
import { getSettings, publicSettings, Settings } from '../models/Settings.js';
import { User } from '../models/User.js';
import { requireAdmin, requireAuth, requirePlan } from '../services/auth.js';
import { categories, categoryById, randomCategory } from '../services/categories.js';
import { updateEnvFile } from '../services/envFile.js';
import { hasPaidAccess, planOf, usage } from '../services/plans.js';
import { ensurePreviews, kick, previewPath, publishJob, youtubeReady } from '../services/queue.js';
import { authUrl, handleCallback, isConfigured } from '../services/youtube.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const EDITABLE_SETTINGS = ['userTags', 'privacy', 'drawSeconds', 'holdSeconds', 'hookText',
  'musicMode', 'musicMood', 'categoryId', 'descriptionFooter'];
const isAdmin = (req) => req.user?.role === 'admin';

/** Public URL Google redirects back to: the configured one, or this request's public host (Vercel/Caddy). */
export function redirectUriFor(req) {
  if (config.google.redirectUri) return config.google.redirectUri;
  const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  return `${req.protocol}://${host}/api/youtube/callback`;
}
const settingsView = (req, s, admin = isAdmin(req)) => publicSettings(s, { isAdmin: admin, redirectUri: redirectUriFor(req) });

// --- public ---------------------------------------------------------------------
router.get('/categories', wrap(async (req, res) => {
  const counts = req.user
    ? Object.fromEntries((await Job.aggregate([
      { $match: { kind: 'video', status: 'published', userId: req.user._id } },
      { $group: { _id: '$category', n: { $sum: 1 } } },
    ])).map((r) => [r._id, r.n]))
    : {};
  res.json(categories.map((c) => {
    const file = previewPath(c.id);
    const exists = fs.existsSync(file);
    const v = exists ? Math.round(fs.statSync(file).mtimeMs) : 0;
    return {
      id: c.id,
      name: c.name,
      group: c.group,
      description: c.description,
      hashtags: c.hashtags,
      published: counts[c.id] || 0,
      previewUrl: exists ? `/media/previews/${c.id}.mp4?v=${v}` : null,
      posterUrl: exists ? `/media/previews/${c.id}.jpg?v=${v}` : null,
    };
  }));
}));

// The Google redirect lands here without our fetch wrapper, so check the session inline.
router.get('/youtube/callback', wrap(async (req, res) => {
  const back = (status) => res.redirect(`${config.clientUrl}/profile/account?youtube=${status}`);
  if (!req.user) return res.redirect(`${config.clientUrl}/login`);
  const expected = req.user.oauthState;
  req.user.oauthState = undefined;
  await req.user.save();
  if (req.query.error || !req.query.code) return back('denied');
  if (!expected || req.query.state !== expected) return back('denied');
  await handleCallback(req.user._id, req.query.code, redirectUriFor(req));
  back('connected');
}));

// Everything below needs a logged-in user.
router.use(requireAuth);

router.post('/categories/:id/preview', requireAdmin, wrap(async (req, res) => {
  if (!categoryById[req.params.id]) return res.status(404).json({ error: 'Unknown category' });
  await ensurePreviews([req.params.id]);
  res.json({ ok: true });
}));

// --- settings (per user) ----------------------------------------------------------------
router.get('/settings', wrap(async (req, res) => {
  res.json(settingsView(req, await getSettings(req.user._id)));
}));

router.put('/settings', wrap(async (req, res) => {
  const settings = await getSettings(req.user._id);
  for (const key of EDITABLE_SETTINGS) if (key in req.body) settings[key] = req.body[key];
  if (Array.isArray(req.body.userTags)) {
    settings.userTags = [...new Set(req.body.userTags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean))].slice(0, 30);
  }
  await settings.save();
  res.json(settingsView(req, settings));
}));

// --- YouTube connection (per user) ---------------------------------------------------
router.get('/youtube/auth', wrap(async (req, res) => {
  if (!isConfigured()) return res.status(400).send('YouTube uploads are not set up on this platform yet.');
  req.user.oauthState = crypto.randomBytes(24).toString('base64url');
  await req.user.save();
  res.redirect(authUrl(req.user.oauthState, redirectUriFor(req)));
}));

router.post('/youtube/disconnect', wrap(async (req, res) => {
  const settings = await getSettings(req.user._id);
  settings.youtube = { tokens: null };
  await settings.save();
  res.json(settingsView(req, settings));
}));

// Platform-wide Google OAuth app: admin only. Saved to server/.env, applied without a restart.
const CLIENT_ID_RE = /^[\w-]{5,120}\.apps\.googleusercontent\.com$/;
const SECRET_RE = /^[\w-]{10,100}$/;

router.put('/youtube/credentials', requireAdmin, wrap(async (req, res) => {
  const clientId = String(req.body.clientId || '').trim();
  const clientSecret = String(req.body.clientSecret || '').trim();
  if (!CLIENT_ID_RE.test(clientId)) {
    return res.status(400).json({ error: 'Client ID should look like 1234-abc.apps.googleusercontent.com' });
  }
  const secret = clientSecret || (clientId === config.google.clientId ? config.google.clientSecret : '');
  if (!SECRET_RE.test(secret)) return res.status(400).json({ error: 'Client secret looks invalid' });
  if (clientId !== config.google.clientId) {
    // every user's tokens belong to the old OAuth app
    await Settings.updateMany({}, { $set: { youtube: { tokens: null } } });
  }
  updateEnvFile({ GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: secret });
  config.google.clientId = clientId;
  config.google.clientSecret = secret;
  res.json(settingsView(req, await getSettings(req.user._id), true));
}));

router.delete('/youtube/credentials', requireAdmin, wrap(async (req, res) => {
  updateEnvFile({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
  config.google.clientId = '';
  config.google.clientSecret = '';
  await Settings.updateMany({}, { $set: { youtube: { tokens: null } } });
  res.json(settingsView(req, await getSettings(req.user._id), true));
}));

// --- Jobs (per user) ------------------------------------------------------------------
router.get('/jobs', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 60, 200);
  res.json(await Job.find({ kind: 'video', userId: req.user._id }).sort({ createdAt: -1 }).limit(limit));
}));

router.post('/jobs', wrap(async (req, res) => {
  const user = req.user;
  const paid = hasPaidAccess(user);
  const requested = req.body.category || 'random';
  if (requested !== 'random' && !categoryById[requested]) return res.status(400).json({ error: 'Unknown category' });
  let count = Math.max(1, Math.min(Number(req.body.count) || 1, 10));

  // Free accounts: exactly one watermarked trial Short, never uploaded or scheduled.
  if (!paid) {
    if (req.body.scheduledFor) return res.status(402).json({ error: 'Scheduling needs a plan', code: 'plan' });
    const claimed = await User.findOneAndUpdate({ _id: user._id, trialUsed: false }, { trialUsed: true });
    if (!claimed) return res.status(402).json({ error: 'Your free trial Short is used. Choose a plan to keep creating.', code: 'plan' });
    const job = await Job.create({
      kind: 'video', userId: user._id, trial: true, priority: -1, autoUpload: false,
      category: requested === 'random' ? randomCategory() : requested,
    });
    kick();
    return res.status(201).json([job]);
  }

  const u = await usage(user);
  const left = u.shortsLimit === null ? Infinity : u.shortsLimit - u.shortsUsed;
  if (left <= 0) return res.status(402).json({ error: `You've used all ${u.shortsLimit} Shorts this month. Upgrade for more.`, code: 'quota' });
  count = Math.min(count, left);

  let scheduledFor = null;
  if (req.body.scheduledFor) {
    scheduledFor = new Date(req.body.scheduledFor);
    const ahead = scheduledFor.getTime() - Date.now();
    if (Number.isNaN(ahead) || ahead < 10 * 60 * 1000 || ahead > 180 * 24 * 3600 * 1000) {
      return res.status(400).json({ error: 'Schedule time must be 10 minutes to 6 months from now' });
    }
  }
  const settings = await getSettings(user._id);
  const priority = ['pro', 'max', 'admin'].includes(planOf(user)?.id) ? 1 : 0;
  const jobs = [];
  for (let i = 0; i < count; i++) {
    jobs.push(await Job.create({
      kind: 'video',
      userId: user._id,
      priority,
      category: requested === 'random' ? randomCategory() : requested,
      autoUpload: Boolean(scheduledFor), // unscheduled Shorts are only rendered; upload is manual
      privacy: ['public', 'unlisted', 'private'].includes(req.body.privacy) ? req.body.privacy : settings.privacy,
      scheduledFor,
    }));
  }
  kick();
  res.status(201).json(jobs);
}));

const loadJob = async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, userId: req.user._id }).catch(() => null);
  if (!job) res.status(404).json({ error: 'Short not found' });
  return job;
};

router.patch('/jobs/:id', wrap(async (req, res) => {
  const job = await loadJob(req, res);
  if (!job) return;
  if (typeof req.body.title === 'string') job.title = req.body.title.slice(0, 100);
  if (typeof req.body.description === 'string') job.description = req.body.description.slice(0, 5000);
  if (Array.isArray(req.body.tags)) job.tags = req.body.tags.map(String).slice(0, 60);
  if (['public', 'unlisted', 'private'].includes(req.body.privacy)) job.privacy = req.body.privacy;
  await job.save();
  res.json(job);
}));

// Upload a finished Short. { now: true } skips its scheduled time; { again: true } re-uploads a
// published Short as a new YouTube video.
router.post('/jobs/:id/publish', requirePlan, wrap(async (req, res) => {
  const job = await loadJob(req, res);
  if (!job) return;
  if (job.trial) return res.status(402).json({ error: 'Trial Shorts can\'t be uploaded. Choose a plan to upload.', code: 'plan' });
  const again = job.status === 'published' && req.body?.again === true;
  if (job.status !== 'ready' && !again) return res.status(409).json({ error: `This Short is ${job.status}` });
  if (!job.video) return res.status(409).json({ error: 'This Short has no video file' });
  if (!(await youtubeReady(req.user._id))) return res.status(400).json({ error: 'Connect your YouTube channel in Profile first' });
  if (again || req.body?.now) {
    job.scheduledFor = undefined; // upload immediately with the job's own visibility
    job.awaitingPublish = false;
  }
  publishJob(job).catch((err) => console.error('[publish]', err.message));
  res.json({ ok: true });
}));

router.post('/jobs/:id/retry', wrap(async (req, res) => {
  const job = await loadJob(req, res);
  if (!job) return;
  if (job.status !== 'failed') return res.status(409).json({ error: `This Short is ${job.status}` });
  Object.assign(job, { status: 'queued', progress: 0, error: undefined });
  await job.save();
  kick();
  res.json(job);
}));

router.delete('/jobs/:id', wrap(async (req, res) => {
  const job = await loadJob(req, res);
  if (!job) return;
  if (['rendering', 'encoding', 'uploading'].includes(job.status)) {
    return res.status(409).json({ error: 'This Short is still processing; wait for it to finish' });
  }
  for (const file of [job.video, job.thumbnail]) {
    if (file) fs.rmSync(path.join(MEDIA_DIR, file), { force: true });
  }
  await job.deleteOne();
  res.json({ ok: true });
}));

export default router;
