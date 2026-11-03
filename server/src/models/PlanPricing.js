import mongoose from 'mongoose';

// Admin-edited plan pricing and limits. One document per plan id (basic / pro / max).
// Anything not stored here falls back to the defaults in services/plans.js.
const planPricingSchema = new mongoose.Schema({
  _id: { type: String, enum: ['basic', 'pro', 'max'] },
  monthly: { type: Number, min: 1 },
  yearly: { type: Number, min: 1 },
  shortsPerPeriod: { type: Number, min: 1 },
  schedules: { type: Number, min: 1, default: null }, // null = unlimited
  features: { type: [String], default: undefined },
}, { timestamps: true });

export const PlanPricing = mongoose.model('PlanPricing', planPricingSchema);
