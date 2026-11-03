import { Job } from '../models/Job.js';
import { PlanPricing } from '../models/PlanPricing.js';
import { Schedule } from '../models/Schedule.js';
import { categories } from './categories.js';

// Prices in rupees. Yearly = 10 x monthly (2 months free). A stored PlanPricing row overrides these.
// styles: how many styles the plan unlocks, counted in STYLE_ORDER.
// ownMusic / priority: uploading your own tracks, and rendering ahead of Basic when the queue is busy.
export const PLANS = {
  basic: { name: 'Basic', monthly: 2000, yearly: 20000, shortsPerPeriod: 10, schedules: 1, styles: 5, ownMusic: false, priority: false,
    features: ['10 Shorts per month', '1 autopilot schedule', '5 styles', 'Auto upload to YouTube', 'No watermark'] },
  pro: { name: 'Pro', monthly: 3000, yearly: 30000, shortsPerPeriod: 30, schedules: 3, styles: 30, ownMusic: true, priority: true,
    features: ['30 Shorts per month', '3 autopilot schedules', '30 styles', 'Auto upload to YouTube', 'Upload your own music', 'Priority rendering'] },
  max: { name: 'Max', monthly: 5000, yearly: 50000, shortsPerPeriod: 400, schedules: Infinity, styles: Infinity, ownMusic: true, priority: true,
    features: ['400 Shorts per month', 'Unlimited schedules', 'All 52 styles', 'Auto upload to YouTube', 'Upload your own music', 'Priority rendering'] },
};
const PLAN_ORDER = ['basic', 'pro', 'max'];

// The order plans unlock styles in: the featured styles first (the ones the landing page shows),
// then the rest in engine/categories.json order. Basic gets the first 5, Pro the first 30.
const FEATURED_FIRST = ['sword_duel', 'moonwalk', 'basketball', 'pancake_chef', 'boxing', 'skateboard', 'yoga'];
export const STYLE_ORDER = [
  ...FEATURED_FIRST.filter((id) => categories.some((c) => c.id === id)),
  ...categories.map((c) => c.id).filter((id) => !FEATURED_FIRST.includes(id)),
];
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

/** Number of styles a plan unlocks (Infinity = all). */
const styleCount = (plan) => (Number.isFinite(plan?.styles) ? plan.styles : STYLE_ORDER.length);

/**
 * Style ids this user can make videos with. Free accounts browse everything and may make their one
 * trial Short in any style; paid plans unlock the first N styles; admins get all.
 */
export function allowedStyles(user) {
  const plan = planOf(user);
  if (!plan) return [...STYLE_ORDER];
  return STYLE_ORDER.slice(0, styleCount(plan));
}

/** The cheapest plan that includes a style. */
export function planForStyle(id) {
  const index = STYLE_ORDER.indexOf(id);
  if (index < 0) return null;
  return PLAN_ORDER.find((p) => index < styleCount(PLANS[p])) || 'max';
}

/** 402 message for a style outside the user's plan, or null when it is allowed. */
export function styleError(user, id) {
  if (allowedStyles(user).includes(id)) return null;
  const need = PLANS[planForStyle(id)]?.name || 'a higher';
  const name = categories.find((c) => c.id === id)?.name || 'This style';
  return `${name} is on the ${need} plan. Upgrade to use it.`;
}

/** Plan perks shared by the job routes, the scheduler and music uploads. */
export const hasPriority = (user) => user?.role === 'admin' || Boolean(planOf(user)?.priority);
export const canUploadMusic = (user) => user?.role === 'admin' || Boolean(planOf(user)?.ownMusic);

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
    stylesLimit: plan ? (Number.isFinite(plan.styles) ? plan.styles : null) : 0, // null = all; 0 = free (trial only)
    allowedStyles: allowedStyles(user),
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
  if (doc.styles !== undefined) p.styles = doc.styles == null ? Infinity : doc.styles;
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

  // styles is optional: leave it out to keep the current count, blank/null for all styles
  const set = { monthly, yearly, shortsPerPeriod, schedules, features };
  if ('styles' in body) {
    const all = body.styles === null || body.styles === '';
    const styles = all ? null : whole(body.styles);
    if (!all && !(styles >= 1 && styles <= STYLE_ORDER.length)) throw bad(`Styles must be 1 to ${STYLE_ORDER.length}, or blank for all`);
    set.styles = styles;
  }
  const doc = await PlanPricing.findOneAndUpdate(
    { _id: id },
    { $set: set },
    { upsert: true, returnDocument: 'after', lean: true },
  );
  applyOverride(doc);
  return publicPlans().find((p) => p.id === id);
}

export function publicPlans() {
  return Object.entries(PLANS).map(([id, p]) => ({
    id, name: p.name, monthly: p.monthly, yearly: p.yearly, features: p.features,
    shortsPerPeriod: p.shortsPerPeriod, schedules: Number.isFinite(p.schedules) ? p.schedules : null,
    styles: styleCount(p), totalStyles: STYLE_ORDER.length, ownMusic: p.ownMusic, priority: p.priority,
    upload: true, watermark: false,
  }));
}
