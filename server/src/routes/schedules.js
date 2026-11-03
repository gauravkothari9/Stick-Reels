import { Router } from 'express';
import { DateTime } from 'luxon';
import { Job } from '../models/Job.js';
import { Schedule } from '../models/Schedule.js';
import { categoryById } from '../services/categories.js';
import { createSlotJobs, nextSlot, upcomingSlots } from '../services/scheduler.js';
import { requireAuth, requirePlan } from '../services/auth.js';
import { styleError, usage } from '../services/plans.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

router.use(requireAuth);

/** Validate a schedule payload; returns [fields, error]. */
function parse(body, user) {
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) return [null, 'Give the schedule a name'];
  const days = [...new Set((body.days || []).map(Number))].filter((d) => d >= 1 && d <= 7).sort();
  if (!days.length) return [null, 'Pick at least one day'];
  const times = [...new Set((body.times || []).map(String))];
  if (!times.length || times.length > 12 || !times.every((t) => TIME_RE.test(t))) return [null, 'Add 1-12 times as HH:MM'];
  const timezone = String(body.timezone || '');
  if (!DateTime.local().setZone(timezone).isValid) return [null, 'Unknown timezone'];
  const categories = [...new Set(body.categories || [])];
  if (!categories.every((c) => categoryById[c])) return [null, 'Unknown style in list'];
  const locked = categories.map((c) => styleError(user, c)).find(Boolean);
  if (locked) return [null, locked];
  const privacy = ['public', 'unlisted', 'private'].includes(body.privacy) ? body.privacy : 'public';
  const perSlot = Math.max(1, Math.min(Number(body.perSlot) || 1, 3));
  return [{ name, days, times: times.sort(), timezone, categories, privacy, perSlot, enabled: body.enabled !== false }, null];
}

router.get('/', wrap(async (req, res) => {
  const schedules = await Schedule.find({ userId: req.user._id }).sort({ createdAt: 1 });
  const counts = Object.fromEntries(
    (await Job.aggregate([{ $match: { userId: req.user._id, scheduleId: { $ne: null }, status: 'published' } },
      { $group: { _id: '$scheduleId', n: { $sum: 1 } } }])).map((r) => [String(r._id), r.n]),
  );
  res.json(schedules.map((s) => ({ ...s.toJSON(), published: counts[s.id] || 0 })));
}));

router.get('/upcoming', wrap(async (req, res) => {
  res.json(await upcomingSlots(req.user._id, Math.min(Number(req.query.limit) || 12, 50)));
}));

router.post('/', requirePlan, wrap(async (req, res) => {
  const [fields, error] = parse(req.body, req.user);
  if (error) return res.status(400).json({ error });
  const u = await usage(req.user);
  if (u.schedulesLimit !== null && u.schedulesUsed >= u.schedulesLimit) {
    return res.status(402).json({ error: `Your plan allows ${u.schedulesLimit} schedule${u.schedulesLimit > 1 ? 's' : ''}. Upgrade for more.`, code: 'quota' });
  }
  const schedule = new Schedule({ ...fields, userId: req.user._id });
  schedule.nextRunAt = schedule.enabled ? nextSlot(schedule) : null;
  await schedule.save();
  res.status(201).json(schedule);
}));

const load = async (req, res) => {
  const s = await Schedule.findOne({ _id: req.params.id, userId: req.user._id }).catch(() => null);
  if (!s) res.status(404).json({ error: 'Schedule not found' });
  return s;
};

router.put('/:id', wrap(async (req, res) => {
  const s = await load(req, res);
  if (!s) return;
  const [fields, error] = parse(req.body, req.user);
  if (error) return res.status(400).json({ error });
  Object.assign(s, fields);
  s.nextRunAt = s.enabled ? nextSlot(s) : null;
  await s.save();
  res.json(s);
}));

router.patch('/:id/enabled', wrap(async (req, res) => {
  const s = await load(req, res);
  if (!s) return;
  s.enabled = Boolean(req.body.enabled);
  s.nextRunAt = s.enabled ? nextSlot(s) : null;
  await s.save();
  res.json(s);
}));

// Make this schedule's Shorts right now (publishes immediately, does not move the next slot).
router.post('/:id/run', requirePlan, wrap(async (req, res) => {
  const s = await load(req, res);
  if (!s) return;
  const jobs = await createSlotJobs(s, null);
  if (!jobs.length) return res.status(402).json({ error: 'No Shorts left this month on your plan.', code: 'quota' });
  s.runs += 1;
  await s.save();
  res.status(201).json(jobs);
}));

router.delete('/:id', wrap(async (req, res) => {
  const s = await load(req, res);
  if (!s) return;
  // queued Shorts from this schedule that haven't started are dropped with it
  await Job.deleteMany({ scheduleId: s._id, status: 'queued' });
  await s.deleteOne();
  res.json({ ok: true });
}));

export default router;
