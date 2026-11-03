import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { Schedule } from '../models/Schedule.js';

/** Schema changes from the single-user version. Safe to run on every start. */
export async function migrate() {
  const settings = mongoose.connection.db.collection('settings');
  const indexes = await settings.indexes().catch(() => []);
  if (indexes.some((i) => i.name === 'key_1')) await settings.dropIndex('key_1'); // old singleton key
}

/** Give Shorts, schedules and settings created before accounts existed to the first (admin) user. */
export async function claimOrphanData(userId) {
  await Job.updateMany({ kind: 'video', userId: null }, { $set: { userId } });
  await Schedule.collection.updateMany({ userId: { $exists: false } }, { $set: { userId } });
  await mongoose.connection.db.collection('settings')
    .updateOne({ userId: { $exists: false } }, { $set: { userId }, $unset: { key: '', autoUpload: '', music: '' } });
}

/**
 * A YouTube channel belongs to one Stick Reels account. If older data links one channel to
 * several accounts, keep it on the admin (else the account that signed up first) and
 * disconnect the rest, which then see "Connect YouTube" and can link their own channel.
 */
export async function dedupeYoutubeChannels() {
  const settings = mongoose.connection.db.collection('settings');
  const users = mongoose.connection.db.collection('users');
  const dupes = await settings.aggregate([
    { $match: { 'youtube.channelId': { $exists: true, $ne: null }, 'youtube.tokens': { $ne: null } } },
    { $group: { _id: '$youtube.channelId', ids: { $push: { id: '$_id', userId: '$userId' } }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  for (const d of dupes) {
    const owners = await users.find({ _id: { $in: d.ids.map((x) => x.userId) } }).project({ role: 1, createdAt: 1 }).toArray();
    owners.sort((a, b) => (b.role === 'admin') - (a.role === 'admin') || (a.createdAt || 0) - (b.createdAt || 0));
    const keep = String(owners[0]?._id);
    const drop = d.ids.filter((x) => String(x.userId) !== keep).map((x) => x.id);
    await settings.updateMany({ _id: { $in: drop } }, { $set: { youtube: { tokens: null } } });
    console.log(`YouTube channel ${d._id} was linked to ${d.n} accounts; kept it on ${keep}, disconnected ${drop.length}`);
  }
}
