import { Router } from 'express';
import { Job } from '../models/Job.js';
import { User } from '../models/User.js';
import { requireAdmin } from '../services/auth.js';
import { hasPaidAccess, publicPlans, updatePlan } from '../services/plans.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.use(requireAdmin);

// --- pricing --------------------------------------------------------------------------
router.get('/plans', (_req, res) => res.json({ plans: publicPlans() }));

router.put('/plans/:id', wrap(async (req, res) => {
  res.json(await updatePlan(req.params.id, req.body));
}));

// --- user accounts with their subscription ------------------------------------------------
router.get('/users', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const filter = q ? { $or: [{ name: new RegExp(escapeRe(q), 'i') }, { email: new RegExp(escapeRe(q), 'i') }] } : {};
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).limit(500),
    User.countDocuments(filter),
  ]);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const stats = await Job.aggregate([
    { $match: { kind: 'video', userId: { $in: users.map((u) => u._id) } } },
    { $group: {
      _id: '$userId',
      videos: { $sum: 1 },
      thisMonth: { $sum: { $cond: [{ $gte: ['$createdAt', monthStart] }, 1, 0] } },
      lastVideoAt: { $max: '$createdAt' },
    } },
  ]);
  const byUser = new Map(stats.map((s) => [String(s._id), s]));

  res.json({
    total,
    users: users.map((u) => {
      const s = byUser.get(String(u._id)) || {};
      const sub = u.subscription || {};
      return {
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        trialUsed: u.trialUsed,
        paid: hasPaidAccess(u),
        subscription: {
          plan: sub.plan || null,
          interval: sub.interval || null,
          status: sub.status || 'none',
          currentStart: sub.currentStart || null,
          currentEnd: sub.currentEnd || null,
          cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
          razorpayId: sub.razorpayId || null,
        },
        videos: s.videos || 0,
        videosThisMonth: s.thisMonth || 0,
        lastVideoAt: s.lastVideoAt || null,
      };
    }),
  });
}));

export default router;
