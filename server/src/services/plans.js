import { Job } from '../models/Job.js';
import { PlanPricing } from '../models/PlanPricing.js';
import { Schedule } from '../models/Schedule.js';

// Prices in rupees. Yearly = 10 x monthly (2 months free).
export const PLANS = {
  basic: { name: 'Basic', monthly: 500, yearly: 5000, shortsPerPeriod: 10, schedules: 1,
    features: ['10 Shorts per month', '1 autopilot schedule', 'All 5 styles', 'Auto upload to YouTube'] },
  pro: { name: 'Pro', monthly: 1200, yearly: 12000, shortsPerPeriod: 30, schedules: 3,
    features: ['30 Shorts per month', '3 autopilot schedules', 'All 30 styles', 'Upload your own music', 'Priority rendering'] },
  max: { name: 'Max', monthly: 2500, yearly: 25000, shortsPerPeriod: 400, schedules: Infinity,
    features: ['400 Shorts per month', 'Unlimited schedules', 'All 52 styles', 'Upload your own music', 'Priority rendering', 'Generated music + quotes'] },
};
export const INTERVALS = ['monthly', 'yearly'];
export const TRIAL_SHORTS = 1;

// Statuses that keep paid access: active, authenticated (mandate set, first charge processing),
// pending (a renewal charge is being retried).
const PAID_STATES = new Set(['active', 'authenticated', 'pending']);

export function hasPaidAccess(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const sub = user.subscription || {};
  if (!sub.plan) return false;
  if (PAID_STATES.has(sub.status)) return true;
  // cancelled at period end: keep access until the paid period is over
  return sub.status === 'cancelled' && sub.currentEnd && sub.currentEnd > new Date();
}

export function planOf(user) {
  if (user?.role === 'admin') return { id: 'admin', ...PLANS.max, name: 'Admin', shortsPerPeriod: Infinity };
  return hasPaidAccess(user) ? { id: user.subscription.plan, ...PLANS[user.subscription.plan] } : null;
}

/** Shorts created in the current billing period (yearly plans get the monthly allowance per 30 days). */
export async function usage(user) {
  const plan = planOf(user);
  const sub = user.subscription || {};
  // no billing period (admin, or a subscription before its first charge): count the calendar month
  const now = new Date();
  let since = sub.currentStart || new Date(now.getFullYear(), now.getMonth(), 1);
  if (sub.interval === 'yearly' && sub.currentStart) {
    const days = Math.floor((Date.now() - sub.currentStart.getTime()) / 86400000);
    since = new Date(sub.currentStart.getTime() + Math.floor(days / 30) * 30 * 86400000);
  }
  const used = await Job.countDocuments({ userId: user._id, kind: 'video', trial: { $ne: true }, createdAt: { $gte: since } });
  const schedules = await Schedule.countDocuments({ userId: user._id });
  return {
    plan: plan?.id || null,
    shortsUsed: used,
    shortsLimit: plan ? (Number.isFinite(plan.shortsPerPeriod) ? plan.shortsPerPeriod : null) : 0, // null = unlimited
    schedulesUsed: schedules,
    schedulesLimit: plan ? (Number.isFinite(plan.schedules) ? plan.schedules : null) : 0,
    periodStart: since,
    trialLeft: user.trialUsed ? 0 : TRIAL_SHORTS,
  };
}

/** Apply one stored override to the in-memory PLANS (every module reads PLANS live). */
function applyOverride(doc) {
  const p = PLANS[doc._id];
  if (!p) return;
  if (doc.monthly) p.monthly = doc.monthly;
  if (doc.yearly) p.yearly = doc.yearly;
  if (doc.shortsPerPeriod) p.shortsPerPeriod = doc.shortsPerPeriod;
  if (doc.schedules !== undefined) p.schedules = doc.schedules == null ? Infinity : doc.schedules;
  if (doc.features?.length) p.features = [...doc.features];
}

/** Load admin pricing from the DB at startup. */
export async function loadPlanOverrides() {
  for (const doc of await PlanPricing.find().lean()) applyOverride(doc);
}

const whole = (v) => Math.round(Number(v));

/**
 * Admin update of one plan. Prices are whole rupees. New prices apply to new subscriptions
 * (a new Razorpay plan is created for the new amount); existing subscribers keep their price.
 */
export async function updatePlan(id, body = {}) {
  if (!PLANS[id]) throw Object.assign(new Error('Unknown plan'), { status: 400 });
  const monthly = whole(body.monthly);
  const yearly = whole(body.yearly);
  const shortsPerPeriod = whole(body.shortsPerPeriod);
  const unlimited = body.schedules === null || body.schedules === '' || body.schedules === undefined;
  const schedules = unlimited ? null : whole(body.schedules);
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  if (!(monthly >= 1 && monthly <= 10000000)) throw bad('Monthly price must be at least ₹1');
  if (!(yearly >= 1 && yearly <= 100000000)) throw bad('Yearly price must be at least ₹1');
  if (!(shortsPerPeriod >= 1 && shortsPerPeriod <= 100000)) throw bad('Shorts per month must be at least 1');
  if (!unlimited && !(schedules >= 1 && schedules <= 1000)) throw bad('Schedules must be at least 1, or blank for unlimited');
  const features = (Array.isArray(body.features) ? body.features : [])
    .map((f) => String(f).trim().slice(0, 120)).filter(Boolean).slice(0, 12);
  if (!features.length) throw bad('Add at least one feature line');

  const doc = await PlanPricing.findOneAndUpdate(
    { _id: id },
    { $set: { monthly, yearly, shortsPerPeriod, schedules, features } },
    { upsert: true, returnDocument: 'after', lean: true },
  );
  applyOverride(doc);
  return publicPlans().find((p) => p.id === id);
}

export function publicPlans() {
  return Object.entries(PLANS).map(([id, p]) => ({
    id, name: p.name, monthly: p.monthly, yearly: p.yearly, features: p.features,
    shortsPerPeriod: p.shortsPerPeriod, schedules: Number.isFinite(p.schedules) ? p.schedules : null,
  }));
}
