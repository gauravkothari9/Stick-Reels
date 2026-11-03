import { useCallback, useEffect, useState } from 'react';
import { IndianRupee, Search, Users } from 'lucide-react';
import { api } from '../api';
import { rupees, useStore } from '../store';

// --- Pricing ------------------------------------------------------------------------------

const toForm = (p) => ({
  monthly: String(p.monthly),
  yearly: String(p.yearly),
  shortsPerPeriod: String(p.shortsPerPeriod),
  schedules: p.schedules == null ? '' : String(p.schedules),
  features: p.features.join('\n'),
});

export function PricingAdminSection() {
  const [plans, setPlans] = useState(null);
  useEffect(() => {
    api.adminPlans().then((d) => setPlans(d.plans)).catch(() => setPlans([]));
  }, []);
  if (!plans) return null;

  return (
    <>
      <section className="card">
        <div className="card-head">
          <span className="card-icon"><IndianRupee size={18} /></span>
          <div>
            <h2>Pricing</h2>
            <p className="muted">
              Changes show on the Pricing page right away. New prices apply to new subscriptions;
              people already subscribed keep paying the price they signed up at.
            </p>
          </div>
        </div>
      </section>
      {plans.map((p) => (
        <PlanEditor key={p.id} plan={p} onSaved={(np) => setPlans((all) => all.map((x) => (x.id === np.id ? np : x)))} />
      ))}
    </>
  );
}

function PlanEditor({ plan, onSaved }) {
  const { notify } = useStore();
  const [form, setForm] = useState(() => toForm(plan));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(plan));
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await api.savePlan(plan.id, {
        monthly: Number(form.monthly),
        yearly: Number(form.yearly),
        shortsPerPeriod: Number(form.shortsPerPeriod),
        schedules: form.schedules.trim() === '' ? null : Number(form.schedules),
        features: form.features.split('\n'),
      });
      onSaved(saved);
      setForm(toForm(saved));
      notify(`${plan.name} plan saved`);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const monthly = Number(form.monthly);
  const yearly = Number(form.yearly);
  const saving = monthly > 0 && yearly > 0 ? Math.round((1 - yearly / (monthly * 12)) * 100) : null;

  return (
    <section className="card">
      <form className="cred-form" onSubmit={save}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <h2 className="toolbar-title">{plan.name}</h2>
          <span className="muted">{rupees(plan.monthly)} / month · {rupees(plan.yearly)} / year</span>
        </div>
        <div className="settings-grid">
          <label className="stack">
            <span className="label">Monthly price (₹)</span>
            <input type="number" min={1} step={1} required inputMode="numeric" value={form.monthly} onChange={set('monthly')} />
          </label>
          <label className="stack">
            <span className="label">Yearly price (₹){saving != null && saving > 0 ? ` · saves ${saving}%` : ''}</span>
            <input type="number" min={1} step={1} required inputMode="numeric" value={form.yearly} onChange={set('yearly')} />
          </label>
          <label className="stack">
            <span className="label">Shorts per month</span>
            <input type="number" min={1} step={1} required inputMode="numeric" value={form.shortsPerPeriod} onChange={set('shortsPerPeriod')} />
          </label>
          <label className="stack">
            <span className="label">Autopilot schedules</span>
            <input type="number" min={1} step={1} inputMode="numeric" placeholder="Blank = unlimited" value={form.schedules} onChange={set('schedules')} />
          </label>
        </div>
        <label className="stack">
          <span className="label">Features (one per line, shown on the Pricing page)</span>
          <textarea rows={5} value={form.features} onChange={set('features')} />
        </label>
        <div className="row">
          <button className="btn primary sm" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save plan'}</button>
          {dirty && <button type="button" className="btn ghost sm" onClick={() => setForm(toForm(plan))}>Reset</button>}
        </div>
      </form>
    </section>
  );
}

// --- Users --------------------------------------------------------------------------------

const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const STATUS_FILTERS = {
  all: () => true,
  paid: (u) => u.paid && u.role !== 'admin',
  free: (u) => !u.paid,
  cancelling: (u) => u.subscription.cancelAtPeriodEnd || u.subscription.status === 'cancelled',
  problem: (u) => ['pending', 'halted'].includes(u.subscription.status),
};
const STATUS_LABELS = { all: 'All', paid: 'Paying', free: 'Free', cancelling: 'Cancelling', problem: 'Payment issue' };

function statusOf(u) {
  const s = u.subscription;
  if (u.role === 'admin') return { text: 'Admin', tone: 'accent' };
  if (!s.plan || s.status === 'none') return { text: u.trialUsed ? 'Free · trial used' : 'Free', tone: 'muted' };
  if (s.status === 'halted') return { text: 'Halted', tone: 'danger' };
  if (s.status === 'pending') return { text: 'Payment retrying', tone: 'warn' };
  if (s.cancelAtPeriodEnd || s.status === 'cancelled') return { text: u.paid ? `Ends ${fmt(s.currentEnd)}` : 'Cancelled', tone: 'warn' };
  if (u.paid) return { text: s.status === 'authenticated' ? 'Starting' : 'Active', tone: 'ok' };
  return { text: s.status, tone: 'muted' };
}

export function UsersAdminSection() {
  const { notify } = useStore();
  const [plans, setPlans] = useState([]);
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback((query) => {
    api.adminUsers(query).then(setData).catch((e) => notify(e.message, 'error'));
  }, [notify]);

  useEffect(() => { api.adminPlans().then((d) => setPlans(d.plans)).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  const planName = (id) => plans.find((p) => p.id === id)?.name || id;
  const priceOf = (s) => {
    const p = plans.find((x) => x.id === s.plan);
    return p && s.interval ? `${rupees(s.interval === 'yearly' ? p.yearly : p.monthly)} / ${s.interval === 'yearly' ? 'yr' : 'mo'}` : '';
  };
  const users = data?.users || [];
  const list = users.filter(STATUS_FILTERS[filter]);
  const mrr = users.filter((u) => u.paid && u.role !== 'admin' && !u.subscription.cancelAtPeriodEnd).reduce((sum, u) => {
    const p = plans.find((x) => x.id === u.subscription.plan);
    if (!p) return sum;
    return sum + (u.subscription.interval === 'yearly' ? p.yearly / 12 : p.monthly);
  }, 0);

  return (
    <>
      <section className="card">
        <div className="card-head">
          <span className="card-icon"><Users size={18} /></span>
          <div>
            <h2>User accounts</h2>
            <p className="muted">
              {data ? `${data.total} account${data.total === 1 ? '' : 's'} · ${users.filter(STATUS_FILTERS.paid).length} paying · about ${rupees(Math.round(mrr))} a month at current prices` : 'Loading…'}
            </p>
          </div>
        </div>
        <label className="admin-search">
          <Search size={15} />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" />
        </label>
        <div className="chips-row" style={{ marginBottom: 0 }}>
          {Object.keys(STATUS_FILTERS).map((f) => (
            <button key={f} className={`filter-chip${f === filter ? ' active' : ''}`} onClick={() => setFilter(f)}>
              {STATUS_LABELS[f]} <span>{users.filter(STATUS_FILTERS[f]).length}</span>
            </button>
          ))}
        </div>
      </section>

      {data && list.length === 0 && <div className="empty">No accounts match.</div>}
      {list.length > 0 && (
        <section className="card admin-users">
          {list.map((u) => {
            const st = statusOf(u);
            const s = u.subscription;
            return (
              <div key={u.id} className="admin-user">
                <div className="admin-user-main">
                  <strong>{u.name}</strong>
                  <span className="muted admin-email">{u.email}</span>
                  <span className="muted admin-sm">Joined {fmt(u.createdAt)}</span>
                </div>
                <div className="admin-user-plan">
                  <span className={`status-pill ${st.tone}`}>{st.text}</span>
                  {s.plan && u.role !== 'admin' && (
                    <span className="admin-sm">{planName(s.plan)} · {s.interval} {priceOf(s) && <span className="muted">· {priceOf(s)}</span>}</span>
                  )}
                  {s.plan && s.currentEnd && u.role !== 'admin' && (
                    <span className="muted admin-sm">
                      {s.cancelAtPeriodEnd || s.status === 'cancelled' ? 'Access until' : 'Renews'} {fmt(s.currentEnd)}
                    </span>
                  )}
                </div>
                <div className="admin-user-usage">
                  <span><strong>{u.videosThisMonth}</strong> <span className="muted">this month</span></span>
                  <span className="muted admin-sm">{u.videos} total · last {fmt(u.lastVideoAt)}</span>
                </div>
              </div>
            );
          })}
        </section>
      )}
      {data && data.total > users.length && <p className="hint">Showing the newest {users.length} accounts. Search to find others.</p>}
    </>
  );
}
