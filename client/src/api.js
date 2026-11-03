// Global signals the app listens for: session expired (401) and plan required (402).
export const authEvents = new EventTarget();

async function handle(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  const err = Object.assign(new Error(data.error || `${fallback} (${res.status})`), { status: res.status, code: data.code });
  if (res.status === 401 && data.code === 'auth') authEvents.dispatchEvent(new Event('logout'));
  if (res.status === 402) authEvents.dispatchEvent(new CustomEvent('paywall', { detail: err.message }));
  throw err;
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return handle(res, 'Request failed');
}

export const api = {
  // account
  me: () => request('GET', '/api/auth/me'),
  signup: (data) => request('POST', '/api/auth/signup', data),
  login: (data) => request('POST', '/api/auth/login', data),
  logout: () => request('POST', '/api/auth/logout'),
  changePassword: (current, next) => request('PUT', '/api/auth/password', { current, next }),
  // billing
  plans: () => request('GET', '/api/billing/plans'),
  subscribe: (plan, interval) => request('POST', '/api/billing/subscribe', { plan, interval }),
  verifyPayment: (resp) => request('POST', '/api/billing/verify', resp),
  refreshBilling: () => request('POST', '/api/billing/refresh'),
  cancelPlan: () => request('POST', '/api/billing/cancel'),
  // admin
  adminPlans: () => request('GET', '/api/admin/plans'),
  savePlan: (id, plan) => request('PUT', `/api/admin/plans/${id}`, plan),
  adminUsers: (q = '') => request('GET', `/api/admin/users?q=${encodeURIComponent(q)}`),
  // platform
  categories: () => request('GET', '/api/categories'),
  settings: () => request('GET', '/api/settings'),
  saveSettings: (patch) => request('PUT', '/api/settings', patch),
  disconnectYoutube: () => request('POST', '/api/youtube/disconnect'),
  saveCredentials: (creds) => request('PUT', '/api/youtube/credentials', creds),
  removeCredentials: () => request('DELETE', '/api/youtube/credentials'),
  jobs: () => request('GET', '/api/jobs'),
  createJobs: (payload) => request('POST', '/api/jobs', payload),
  updateJob: (id, patch) => request('PATCH', `/api/jobs/${id}`, patch),
  publishJob: (id, opts = {}) => request('POST', `/api/jobs/${id}/publish`, opts),
  retryJob: (id) => request('POST', `/api/jobs/${id}/retry`),
  deleteJob: (id) => request('DELETE', `/api/jobs/${id}`),
  musicTracks: () => request('GET', '/api/music'),
  uploadTrack: async (file) => handle(await fetch('/api/music', {
    method: 'POST', credentials: 'same-origin', body: file,
    headers: { 'X-Filename': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' },
  }), 'Upload failed'),
  deleteTrack: (name) => request('DELETE', `/api/music/${encodeURIComponent(name)}`),
  musicSample: (mood) => request('POST', '/api/music/sample', { mood }),
  backfillStatus: () => request('GET', '/api/music/backfill'),
  startBackfill: () => request('POST', '/api/music/backfill'),
  schedules: () => request('GET', '/api/schedules'),
  upcoming: () => request('GET', '/api/schedules/upcoming?limit=10'),
  createSchedule: (s) => request('POST', '/api/schedules', s),
  updateSchedule: (id, s) => request('PUT', `/api/schedules/${id}`, s),
  toggleSchedule: (id, enabled) => request('PATCH', `/api/schedules/${id}/enabled`, { enabled }),
  runSchedule: (id) => request('POST', `/api/schedules/${id}/run`),
  deleteSchedule: (id) => request('DELETE', `/api/schedules/${id}`),
};

/** Load Razorpay Checkout once, on demand. */
let checkoutScript;
export function loadRazorpay() {
  checkoutScript ||= new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(window.Razorpay);
    s.onerror = () => {
      checkoutScript = null;
      reject(new Error('Could not load Razorpay. Check your connection and try again.'));
    };
    document.body.appendChild(s);
  });
  return checkoutScript;
}
