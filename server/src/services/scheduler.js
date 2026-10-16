import { DateTime } from 'luxon';
import { Job } from '../models/Job.js';
import { Schedule } from '../models/Schedule.js';
import { User } from '../models/User.js';
import { hasPaidAccess, planOf, usage } from './plans.js';
import { categories } from './categories.js';
import { kick, publishDueJobs } from './queue.js';

const TICK_MS = 30 * 1000;
const LEAD_MS = 20 * 60 * 1000; // start rendering this long before a slot so upload is done in time
const GRACE_MS = 2 * 60 * 60 * 1000; // a slot missed by more than this (server was off) is skipped

/** Next slot strictly after `from` on one of the schedule's weekdays/times, in its timezone. */
export function nextSlot(schedule, from = new Date()) {
  const start = DateTime.fromJSDate(from).setZone(schedule.timezone);
  if (!start.isValid || !schedule.days.length || !schedule.times.length) return null;
  const times = [...schedule.times].sort();
  for (let d = 0; d <= 7; d++) {
    const day = start.startOf('day').plus({ days: d });
    if (!schedule.days.includes(day.weekday)) continue;
    for (const t of times) {
      const [hour, minute] = t.split(':').map(Number);
      const slot = day.set({ hour, minute, second: 0, millisecond: 0 });
      if (slot > start) return slot.toJSDate();
    }
  }
  return null;
}

/** Upcoming slots across one user's enabled schedules, soonest first. */
export async function upcomingSlots(userId, limit = 12) {
  const out = [];
  for (const s of await Schedule.find({ userId, enabled: true })) {
    let at = s.nextRunAt;
    for (let i = 0; at && i < limit; i++) {
      out.push({ scheduleId: s.id, name: s.name, at, privacy: s.privacy, perSlot: s.perSlot });
      at = nextSlot(s, at);
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, limit);
}

function pickCategory(schedule, index) {
  const pool = schedule.categories.length ? schedule.categories : categories.map((c) => c.id);
  // rotate through the chosen styles; with "any style" pick at random
  return schedule.categories.length ? pool[index % pool.length] : pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Create the Shorts for one slot, within the owner's plan. Returns [] when the owner has no
 * active plan or no Shorts left this month.
 */
export async function createSlotJobs(schedule, scheduledFor) {
  const user = await User.findById(schedule.userId);
  if (!hasPaidAccess(user)) return [];
  const u = await usage(user);
  const left = u.shortsLimit === null ? Infinity : u.shortsLimit - u.shortsUsed;
  const count = Math.min(schedule.perSlot, Math.max(0, left));
  const priority = ['pro', 'max', 'admin'].includes(planOf(user)?.id) ? 1 : 0;
  const jobs = [];
  for (let i = 0; i < count; i++) {
    jobs.push(await Job.create({
      kind: 'video',
      userId: schedule.userId,
      priority,
      category: pickCategory(schedule, schedule.runs * schedule.perSlot + i),
      autoUpload: true,
      privacy: schedule.privacy,
      scheduleId: schedule._id,
      scheduledFor,
    }));
  }
  kick();
  return jobs;
}

async function tick() {
  const now = Date.now();
  const due = await Schedule.find({ userId: { $ne: null }, enabled: true, nextRunAt: { $ne: null, $lte: new Date(now + LEAD_MS) } });
  for (const s of due) {
    const slot = s.nextRunAt;
    const missed = slot.getTime() < now - GRACE_MS;
    if (!missed) {
      await createSlotJobs(s, slot);
      s.runs += 1;
      s.lastRunAt = slot;
    }
    s.nextRunAt = nextSlot(s, missed ? new Date(now) : slot);
    await s.save();
  }
  await publishDueJobs();
}

let running = false;
async function safeTick() {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch (err) {
    console.error('[scheduler]', err.message);
  } finally {
    running = false;
  }
}

export async function startScheduler() {
  // recompute slots on boot (timezone rules or code may have changed while offline)
  for (const s of await Schedule.find({ userId: { $ne: null }, enabled: true, nextRunAt: null })) {
    s.nextRunAt = nextSlot(s);
    await s.save();
  }
  await safeTick();
  setInterval(safeTick, TICK_MS).unref();
}
