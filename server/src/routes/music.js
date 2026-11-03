import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { MEDIA_DIR } from '../config.js';
import { Job } from '../models/Job.js';
import { MUSIC_MOODS as MOODS, getSettings } from '../models/Settings.js';
import { rateLimit, requireAuth } from '../services/auth.js';
import { canUploadMusic } from '../services/plans.js';
import { runPython, userMusicDir } from '../services/queue.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const SAMPLE_DIR = path.join(MEDIA_DIR, 'music-samples');
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
// Own music upload is a plan perk (Pro and Max by default); see services/plans.js.

router.use(requireAuth);

/** Reduce an uploaded name to a safe basename, or null. */
function safeName(raw) {
  const base = path.basename(String(raw || '')).replace(/[^\w.\- ()]/g, '_').slice(0, 100);
  const ext = path.extname(base).toLowerCase();
  if (!base || base.startsWith('.') || !AUDIO_EXT.has(ext)) return null;
  return base;
}

router.get('/', (req, res) => {
  const dir = userMusicDir(req.user._id);
  const tracks = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase())).map((f) => ({
      name: f,
      size: fs.statSync(path.join(dir, f)).size,
      url: `/media/music/${req.user.id}/${encodeURIComponent(f)}`,
    }))
    : [];
  res.json({ tracks, canUpload: canUploadMusic(req.user) });
});

// Raw upload: body is the audio file, name in the X-Filename header. Pro and Max plans.
router.post('/', express.raw({ type: () => true, limit: '40mb' }), (req, res) => {
  if (!canUploadMusic(req.user)) return res.status(402).json({ error: 'Uploading your own music needs the Pro or Max plan', code: 'plan' });
  const name = safeName(decodeURIComponent(req.get('x-filename') || ''));
  if (!name) return res.status(400).json({ error: 'Upload an audio file (mp3, wav, m4a, aac, ogg, flac)' });
  if (!req.body?.length) return res.status(400).json({ error: 'Empty file' });
  const dir = userMusicDir(req.user._id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), req.body);
  res.status(201).json({ name });
});

router.delete('/:name', (req, res) => {
  const name = safeName(req.params.name);
  const file = name && path.join(userMusicDir(req.user._id), name);
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'Track not found' });
  fs.rmSync(file);
  res.json({ ok: true });
});

// Synthesize a short sample so the user can hear a mood before choosing it.
router.post('/sample', rateLimit((req) => `sample:${req.user.id}`, { max: 20, windowMs: 10 * 60 * 1000 }), wrap(async (req, res) => {
  const mood = MOODS.includes(req.body?.mood) ? req.body.mood : MOODS[Math.floor(Math.random() * MOODS.length)];
  fs.mkdirSync(SAMPLE_DIR, { recursive: true });
  const out = path.join(SAMPLE_DIR, `${mood}.wav`);
  await runPython('music', ['--out', out, '--duration', '14', '--mood', mood]);
  res.json({ mood, url: `/media/music-samples/${mood}.wav?v=${Date.now()}` });
}));

// Add music to this user's unpublished Shorts that were rendered without it.
const backfills = new Map(); // userId -> progress
const pendingQuery = (userId) => ({ userId, kind: 'video', status: 'ready', video: { $ne: null }, music: null });

router.get('/backfill', wrap(async (req, res) => {
  const pending = await Job.countDocuments(pendingQuery(req.user._id));
  const published = await Job.countDocuments({ userId: req.user._id, kind: 'video', status: 'published', music: null });
  res.json({ ...(backfills.get(req.user.id) || { running: false, done: 0, total: 0, failed: 0 }), pending, published });
}));

router.post('/backfill', wrap(async (req, res) => {
  const key = req.user.id;
  if (backfills.get(key)?.running) return res.status(409).json({ error: 'Already adding music' });
  const settings = await getSettings(req.user._id);
  if (settings.musicMode === 'off') return res.status(400).json({ error: 'Music is turned off in Video settings' });
  const jobs = await Job.find(pendingQuery(req.user._id));
  const state = { running: true, done: 0, total: jobs.length, failed: 0 };
  backfills.set(key, state);
  res.json(state);
  for (const job of jobs) {
    try {
      const args = ['--video', path.join(MEDIA_DIR, job.video), '--music', settings.musicMode,
        '--music-dir', userMusicDir(req.user._id), '--mood', settings.musicMood, '--category', job.category];
      if (job.seed != null) args.push('--seed', String(job.seed));
      const result = await runPython('add_music', args);
      await Job.updateOne({ _id: job._id, status: 'ready' }, { music: result.music });
      state.done += 1;
    } catch (err) {
      state.failed += 1;
      console.error('[music backfill]', job.id, err.message);
    }
  }
  state.running = false;
}));

export default router;
