import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    enabled: { type: Boolean, default: true },
    categories: { type: [String], default: [] }, // empty = any style
    days: { type: [Number], required: true }, // ISO weekdays: 1 = Monday ... 7 = Sunday
    times: { type: [String], required: true }, // "HH:mm" in `timezone`
    timezone: { type: String, required: true },
    privacy: { type: String, enum: ['public', 'unlisted', 'private'], default: 'public' },
    perSlot: { type: Number, min: 1, max: 3, default: 1 },
    nextRunAt: Date,
    lastRunAt: Date,
    runs: { type: Number, default: 0 },
    waitingForUploads: { type: Boolean, default: false }, // slot held until failed uploads go through
    note: String, // shown on the schedule card while it waits
  },
  { timestamps: true },
);

scheduleSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Schedule = mongoose.model('Schedule', scheduleSchema);
