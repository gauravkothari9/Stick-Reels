import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { config, MEDIA_DIR, ROOT } from '../config.js';
import { Job } from '../models/Job.js';
import { getSettings } from '../models/Settings.js';
import { User } from '../models/User.js';
import { hasPaidAccess } from './plans.js';
import { categories } from './categories.js';
import { buildMetadata } from './metadata.js';
import { pickQuote } from './quotes.js';
import { isConfigured, uploadShort } from './youtube.js';

let busy = false;

export const previewPath = (category) => path.join(MEDIA_DIR, 'previews', `${category}.mp4`);

/** Run an engine module (python -m engine.<name>); resolves with its final "done" payload. */
export function runPython(module, args, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.uvBin, ['run', '--project', ROOT, 'python', '-m', `engine.${module}`, ...args], {
      cwd: ROOT,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
    });
    let result = null;
    let failure = null;
    let stderr = '';
    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return; // non-JSON library chatter
      }
      if (msg.event === 'progress') onProgress(msg.stage, msg.progress);
      else if (msg.event === 'done') result = msg;
      else if (msg.event === 'error') failure = msg.message;
    });
    proc.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)));
    proc.on('error', (err) => reject(new Error(`Could not start Python engine (${config.uvBin}): ${err.message}`)));
    proc.on('close', (code) => {
      if (code === 0 && result) resolve(result);
      else reject(new Error(failure || stderr.trim().split('\n').pop() || `Engine exited with code ${code}`));
    });
  });
}

const rel = (abs) => path.relative(MEDIA_DIR, abs).split(path.sep).join('/');

export const userMusicDir = (userId) => path.join(MEDIA_DIR, 'music', String(userId));

async function renderJob(job) {
  const preview = job.kind === 'preview';
  const settings = preview ? null : await getSettings(job.userId);
  const out = preview ? previewPath(job.category) : path.join(MEDIA_DIR, 'videos', `${job.id}.mp4`);
  const args = ['--category', job.category, '--out', out];
  if (preview) {
    args.push('--width', '360', '--height', '640', '--fps', '24', '--draw-seconds', '7',
      '--hold-seconds', '1.5', '--crf', '26', '--no-hook', '--no-music');
  } else {
    args.push('--draw-seconds', String(settings.drawSeconds), '--hold-seconds', String(settings.holdSeconds));
    if (settings.hookText) args.push('--hook', await pickQuote(job.userId));
    else args.push('--no-hook');
    args.push('--music', settings.musicMode, '--music-dir', userMusicDir(job.userId));
    if (job.trial) args.push('--watermark', 'Stick Reels · free trial');
    args.push('--mood', settings.musicMood);
  }
  if (job.seed != null) args.push('--seed', String(job.seed));

  job.status = 'rendering';
  job.progress = 0;
  await job.save();

  let lastWrite = 0;
  let writes = Promise.resolve(); // serialize progress writes so none land after the final save
  const result = await runPython('render', args, (stage, p) => {
    const now = Date.now();
    if (now - lastWrite < 700 && p < 1) return;
    lastWrite = now;
    // render is ~75% of wall time, encode the rest
    const progress = stage === 'render' ? p * 0.75 : 0.75 + p * 0.25;
    const status = stage === 'render' ? 'rendering' : 'encoding';
    writes = writes.then(() => Job.updateOne({ _id: job._id }, { status, progress })).catch(() => {});
  });
  await writes;

  Object.assign(job, {
    seed: result.seed,
    palette: result.palette,
    hook: result.hook,
    duration: result.duration,
    video: rel(result.video),
    thumbnail: rel(result.thumbnail),
    music: result.music,
    progress: 1,
    status: 'ready',
  });
  if (!preview) {
    Object.assign(job, buildMetadata({
      category: job.category,
      palette: result.palette,
      userTags: settings.userTags,
      footer: settings.descriptionFooter,
    }));
  }
  await job.save();
}

// YouTube rejects a publishAt that is too close; below this margin we just publish directly.
const MIN_PUBLISH_AT_LEAD = 5 * 60 * 1000;

const isFuture = (date, margin = 0) => Boolean(date) && date.getTime() > Date.now() + margin;
export const youtubeReady = async (userId) => isConfigured() && Boolean((await getSettings(userId)).youtube?.tokens);

// A failed upload is retried on this interval until it goes through or the attempts run out
// (48 hours: long enough to outlast YouTube's rolling 24-hour channel upload limit).
const UPLOAD_RETRY_MS = 5 * 60 * 1000;
const MAX_UPLOAD_RETRIES = (48 * 60 * 60 * 1000) / UPLOAD_RETRY_MS;

/** `retry` marks an automatic retry by the scheduler; any other call starts the retry count over. */
export async function publishJob(job, { retry = false } = {}) {
  job.retryAt = undefined;
  if (!retry) job.uploadAttempts = 0;
  const settings = await getSettings(job.userId);
  if (!isConfigured()) throw new Error('YouTube uploads are not set up on this platform yet');
  if (!settings.youtube?.tokens) throw new Error('Connect your YouTube channel first');
  if (job.trial) throw new Error('Trial Shorts can\'t be uploaded. Choose a plan to upload.');
  if (!hasPaidAccess(await User.findById(job.userId))) {
    job.error = 'Your plan is inactive, so this Short was not uploaded.';
    job.awaitingPublish = false;
    await job.save();
    return;
  }
  // Public + future slot: hand the timing to YouTube so it goes live even if this server is off.
  const publishAt = job.privacy === 'public' && isFuture(job.scheduledFor, MIN_PUBLISH_AT_LEAD) ? job.scheduledFor : null;
  job.status = 'uploading';
  job.progress = 0;
  job.error = undefined;
  job.note = undefined;
  job.awaitingPublish = false;
  await job.save();
  let writes = Promise.resolve();
  try {
    const id = await uploadShort({
      userId: job.userId,
      file: path.join(MEDIA_DIR, job.video),
      title: job.title,
      description: job.description,
      tags: job.tags,
      privacy: job.privacy,
      publishAt,
      categoryId: settings.categoryId,
      onProgress: (p) => {
        writes = writes.then(() => Job.updateOne({ _id: job._id }, { progress: p })).catch(() => {});
      },
    });
    Object.assign(job, { status: 'published', youtubeId: id, publishedAt: new Date(), publishAt, progress: 1 });
  } catch (err) {
    Object.assign(job, { status: 'ready', error: `Upload failed: ${err.message}` });
    if (job.uploadAttempts < MAX_UPLOAD_RETRIES) {
      job.uploadAttempts += 1;
      job.retryAt = new Date(Date.now() + UPLOAD_RETRY_MS);
      job.note = 'Retrying the upload automatically every 5 minutes.';
    } else {
      job.note = 'Automatic retries stopped. Use Retry upload to try again.';
    }
  }
  await writes;
  await job.save();
}

/** After rendering: upload now, upload with publishAt, or hold until the scheduled time. */
async function autoPublish(job) {
  if (!(await youtubeReady(job.userId))) {
    job.note = job.scheduledFor ? 'Scheduled, but YouTube is not connected.' : 'Rendered. Connect YouTube to publish.';
    await job.save();
    return;
  }
  if (job.privacy !== 'public' && isFuture(job.scheduledFor)) {
    job.awaitingPublish = true; // unlisted/private can't use publishAt: the scheduler uploads it on time
    await job.save();
    return;
  }
  await publishJob(job);
}

/** Upload held jobs whose time has come, and retry failed uploads (called by the scheduler). */
export async function publishDueJobs() {
  const now = new Date();
  const due = await Job.find({ status: 'ready', awaitingPublish: true, scheduledFor: { $lte: now } });
  for (const job of due) await publishJob(job).catch((err) => console.error('[publish]', job.id, err.message));
  const retries = await Job.find({ status: 'ready', retryAt: { $lte: now } });
  for (const job of retries) {
    await publishJob(job, { retry: true }).catch(async (err) => {
      // not retryable (YouTube disconnected, etc.): stop retrying and show why
      console.error('[publish]', job.id, err.message);
      await Job.updateOne({ _id: job._id }, { $unset: { retryAt: 1 }, error: `Upload failed: ${err.message}`, note: 'Automatic retries stopped.' });
    });
  }
}

async function processNext() {
  if (busy) return;
  // scheduled videos (soonest slot first), then other videos by plan priority, then style previews
  const job =
    (await Job.findOne({ status: 'queued', kind: 'video', scheduledFor: { $ne: null } }).sort({ scheduledFor: 1 })) ||
    (await Job.findOne({ status: 'queued', kind: 'video' }).sort({ priority: -1, createdAt: 1 })) ||
    (await Job.findOne({ status: 'queued', kind: 'preview' }).sort({ createdAt: 1 }));
  if (!job) return;
  busy = true;
  try {
    await renderJob(job);
    if (job.kind === 'video' && job.autoUpload) await autoPublish(job);
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    await job.save().catch(() => {});
    console.error(`[queue] job ${job.id} failed:`, err.message);
  } finally {
    busy = false;
    setImmediate(processNext);
  }
}

export const kick = () => setImmediate(processNext);

export async function ensurePreviews(force = []) {
  for (const { id } of categories) {
    const missing = !fs.existsSync(previewPath(id)) || force.includes(id);
    const pending = await Job.exists({ kind: 'preview', category: id, status: { $in: ['queued', 'rendering', 'encoding'] } });
    if (missing && !pending) await Job.create({ kind: 'preview', category: id, autoUpload: false });
  }
  kick();
}

export async function startQueue() {
  // recover work interrupted by a restart
  await Job.updateMany({ status: { $in: ['rendering', 'encoding'] } }, { status: 'queued', progress: 0 });
  await Job.updateMany({ status: 'uploading' }, { status: 'ready', error: 'Upload interrupted by restart' });
  // uploads that failed before automatic retries existed
  await Job.updateMany(
    { status: 'ready', error: /^Upload failed/, retryAt: null, uploadAttempts: { $not: { $gte: MAX_UPLOAD_RETRIES } } },
    { retryAt: new Date() },
  );
  await ensurePreviews();
  setInterval(processNext, 5000).unref();
}
