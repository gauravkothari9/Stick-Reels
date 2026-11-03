import { DateTime } from 'luxon';
import { Job } from '../models/Job.js';
import { Schedule } from '../models/Schedule.js';
import { User } from '../models/User.js';
import { allowedStyles, hasPaidAccess, hasPriority, usage } from './plans.js';
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

function pickCategory(schedule, index, allowed) {
  // Only styles the owner's plan unlocks (a downgrade drops the rest from the rotation).
  const chosen = schedule.categories.filter((c) => allowed.includes(c));
  // rotate through the chosen styles; with "any style" (or none left) pick at random
  return chosen.length ? chosen[index % chosen.length] : allowed[Math.floor(Math.random() * allowed.length)];
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
  const priority = hasPriority(user) ? 1 : 0;
  const allowed = allowedStyles(user);
  const jobs = [];
  for (let i = 0; i < count; i++) {
    jobs.push(await Job.create({
      kind: 'video',
      userId: schedule.userId,
      priority,
      category: pickCategory(schedule, schedule.runs * schedule.perSlot + i, allowed),
      autoUpload: true,
      privacy: schedule.privacy,
      scheduleId: schedule._id,
      scheduledFor,
    }));
  }
  kick();
  return jobs;
}

const WAITING_NOTE = "Waiting: earlier videos haven't uploaded to YouTube yet. New ones will be made once they are up.";

/** True while one of the user's videos failed to upload and hasn't reached YouTube yet. */
async function hasPendingUploads(userId) {
  return Boolean(await Job.exists({
    userId, kind: 'video', trial: { $ne: true }, status: 'ready', error: /^Upload (failed|interrupted)/,
  }));
}

async function tick() {
  // Retry failed uploads first, so a schedule waiting on them can run in this same tick.
  await publishDueJobs();
  const now = Date.now();
  const due = await Schedule.find({ userId: { $ne: null }, enabled: true, nextRunAt: { $ne: null, $lte: new Date(now + LEAD_MS) } });
  for (const s of due) {
    const slot = s.nextRunAt;
    const held = s.waitingForUploads;
    // A slot held back for earlier uploads is never "missed": it runs as soon as they are up.
    const missed = !held && slot.getTime() < now - GRACE_MS;
    if (!missed) {
      if (await hasPendingUploads(s.userId)) {
        // Earlier videos still need to reach YouTube: keep this slot (nextRunAt unchanged) and check every tick.
        if (!held) {
          s.waitingForUploads = true;
          s.note = WAITING_NOTE;
          await s.save();
        }
        continue;
      }
      // A held slot whose time has passed goes out right away.
      const scheduledFor = new Date(Math.max(slot.getTime(), now));
      await createSlotJobs(s, scheduledFor);
      s.runs += 1;
      s.lastRunAt = scheduledFor;
    }
    // After a hold, carry on from now: the slots that passed meanwhile don't all fire at once.
    s.nextRunAt = nextSlot(s, missed ? new Date(now) : held ? new Date(Math.max(slot.getTime(), now)) : slot);
    s.waitingForUploads = false;
    s.note = undefined;
    await s.save();
  }
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
