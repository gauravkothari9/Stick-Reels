import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Clapperboard, Copy, CreditCard, IndianRupee, KeyRound, Lock, LogOut, Pencil, Settings2, Tag, Trash2, UserRound, Users } from 'lucide-react';
import { api } from '../api';
import { PricingAdminSection, UsersAdminSection } from './Admin';
import JobCard from '../components/JobCard';
import MusicCard from '../components/MusicCard';
import ScheduleSection from './Schedule';
import TagInput from '../components/TagInput';
import YoutubeIcon from '../components/YoutubeIcon';
import { rupees, useStore } from '../store';

const SECTIONS = [
  { id: 'account', label: 'Account & Channel', icon: UserRound },
  { id: 'billing', label: 'Plan & billing', icon: CreditCard },
  { id: 'shorts', label: 'Your Shorts', icon: Clapperboard },
  { id: 'schedule', label: 'Schedule', icon: CalendarClock },
  { id: 'settings', label: 'Video settings', icon: Settings2 },
];
const ADMIN_SECTIONS = [
  { id: 'pricing', label: 'Pricing', icon: IndianRupee },
  { id: 'users', label: 'User accounts', icon: Users },
];
const ALL_SECTIONS = [...SECTIONS, ...ADMIN_SECTIONS];

export default function Profile() {
  const { section } = useParams();
  const [params, setParams] = useSearchParams();
  const { notify, jobs, user } = useStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const sections = isAdmin ? ALL_SECTIONS : SECTIONS;

  useEffect(() => {
    const yt = params.get('youtube');
    if (!yt) return;
    if (yt === 'connected') notify('YouTube channel connected');
    else notify('YouTube connection was cancelled', 'error');
    setParams({}, { replace: true });
  }, [params, setParams, notify]);

  useEffect(() => {
    if (!user) return;
    if (!sections.some((s) => s.id === section)) navigate('/profile/account', { replace: true });
  }, [section, navigate, sections, user]);

  const link = ({ id, label, icon: Icon }) => (
    <NavLink key={id} to={`/profile/${id}`}>
      <Icon size={16} /> {label}
      {id === 'shorts' && jobs.length > 0 && <span className="nav-count">{jobs.length}</span>}
    </NavLink>
  );

  return (
    <div className="profile">
      <aside className="profile-nav">
        <h1>Profile</h1>
        {SECTIONS.map(link)}
        {isAdmin && <span className="profile-nav-group">Admin</span>}
        {isAdmin && ADMIN_SECTIONS.map(link)}
      </aside>
      <div className="profile-content">
        {section === 'account' && <AccountSection />}
        {section === 'billing' && <BillingSection />}
        {section === 'shorts' && <ShortsSection />}
        {section === 'schedule' && <ScheduleSection />}
        {section === 'settings' && <SettingsSection />}
        {isAdmin && section === 'pricing' && <PricingAdminSection />}
        {isAdmin && section === 'users' && <UsersAdminSection />}
      </div>
    </div>
  );
}

function AccountSection() {
  const { settings, setSettings, saveSettings, user } = useStore();
  if (!settings) return null;
  const yt = settings.youtube;
  const isAdmin = user?.role === 'admin';

  return (
    <>
      <AccountCard />
      <section className="card">
        <div className="card-head">
          <span className="card-icon yt-bg"><YoutubeIcon size={18} /></span>
          <div>
            <h2>YouTube channel</h2>
            <p className="muted">Finished Shorts upload here with their title, description and tags.</p>
          </div>
        </div>
        {yt.connected ? (
          <div className="connected-row">
            <CheckCircle2 size={18} className="ok" />
            <div>
              <strong>{yt.channelTitle}</strong>
              <span className="muted">Connected. Scheduled Shorts upload automatically; others wait for your Upload click.</span>
            </div>
            <button className="btn ghost sm" onClick={async () => setSettings(await api.disconnectYoutube())}>
              <LogOut size={14} /> Disconnect
            </button>
          </div>
        ) : yt.configured ? (
          <a className="btn yt" href="/api/youtube/auth"><YoutubeIcon size={16} /> Connect YouTube</a>
        ) : (
          <p className="hint warn">
            {isAdmin ? 'Add the Google API credentials below, then connect your channel.'
              : "YouTube uploads aren't available yet. The platform is finishing its setup."}
          </p>
        )}
      </section>

      {isAdmin && <GoogleCredentialsCard />}


      <section className="card">
        <div className="card-head">
          <span className="card-icon"><Tag size={18} /></span>
          <div>
            <h2>Your tags</h2>
            <p className="muted">Added to every Short, ahead of the automatic style and trending tags.</p>
          </div>
        </div>
        <TagInput tags={settings.userTags} onChange={(userTags) => saveSettings({ userTags })} placeholder="Type a tag and press Enter" />
        <span className="hint">Press Enter or comma to add. Your first 5 tags also show as hashtags in the description.</span>
      </section>
    </>
  );
}

function AccountCard() {
  const { user, notify } = useStore();
  const [editing, setEditing] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.changePassword(pw.current, pw.next);
      notify('Password changed. Other devices were signed out.');
      setPw({ current: '', next: '' });
      setEditing(false);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <span className="card-icon"><UserRound size={18} /></span>
        <div>
          <h2>{user.name}</h2>
          <p className="muted">{user.email}{user.role === 'admin' ? ' · Platform admin' : ''}</p>
        </div>
      </div>
      {!editing ? (
        <button className="btn ghost sm" onClick={() => setEditing(true)}><Lock size={14} /> Change password</button>
      ) : (
        <form className="cred-form" onSubmit={save}>
          <div className="settings-grid">
            <label className="stack">
              <span className="label">Current password</span>
              <input type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </label>
            <label className="stack">
              <span className="label">New password</span>
              <input type="password" autoComplete="new-password" required minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <button className="btn primary sm" disabled={busy}>Save password</button>
            <button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

function Meter({ label, used, limit }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="meter">
      <div className="meter-top"><span>{label}</span><span className="muted">{used} / {limit ?? '∞'}</span></div>
      <div className="progress"><div style={{ width: `${limit ? pct : 4}%` }} /></div>
    </div>
  );
}

function BillingSection() {
  const { account, setAccount, hasPlan, notify, user } = useStore();
  const [plans, setPlans] = useState([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.plans().then((d) => setPlans(d.plans)).catch(() => {});
    api.refreshBilling().then(setAccount).catch(() => {}); // pick up renewals/cancellations
  }, [setAccount]);

  if (!account) return null;
  const sub = user.subscription || {};
  const plan = plans.find((p) => p.id === sub.plan);
  const u = account.usage;
  const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  const cancel = async () => {
    setBusy(true);
    try {
      setAccount(await api.cancelPlan());
      notify('Subscription cancelled. You keep access until the end of this period.');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  if (user.role === 'admin') {
    return (
      <section className="card">
        <div className="card-head">
          <span className="card-icon"><CreditCard size={18} /></span>
          <div><h2>Admin account</h2><p className="muted">Full access without a subscription.</p></div>
        </div>
        <Meter label="Shorts this month" used={u.shortsUsed} limit={u.shortsLimit} />
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <span className="card-icon"><CreditCard size={18} /></span>
          <div>
            <h2>{hasPlan && plan ? `${plan.name} plan` : 'Free account'}</h2>
            <p className="muted">
              {hasPlan && plan
                ? `${rupees(sub.interval === 'yearly' ? plan.yearly : plan.monthly)} / ${sub.interval === 'yearly' ? 'year' : 'month'} · ${
                  sub.cancelAtPeriodEnd || sub.status === 'cancelled' ? `ends ${fmt(sub.currentEnd)}` : `renews ${fmt(sub.currentEnd)}`}`
                : `${u.trialLeft ? '1 free trial Short left' : 'Free trial Short used'}. Choose a plan to upload, schedule and create more.`}
            </p>
          </div>
        </div>
        {sub.status === 'pending' && <p className="hint warn">Your last renewal payment failed. Razorpay will retry; update your payment method if it keeps failing.</p>}
        {sub.status === 'halted' && <p className="hint warn">Payments failed repeatedly, so the plan is paused. Choose a plan again to continue.</p>}
        {hasPlan && (
          <>
            <Meter label="Shorts this month" used={u.shortsUsed} limit={u.shortsLimit} />
            <Meter label="Schedules" used={u.schedulesUsed} limit={u.schedulesLimit} />
            {u.allowedStyles && (
              <p className="hint">
                {u.stylesLimit == null ? 'Every style is unlocked.' : `${u.allowedStyles.length} styles unlocked. Higher plans unlock more.`}
              </p>
            )}
          </>
        )}
        <div className="row">
          <Link to="/pricing" className="btn primary sm">{hasPlan ? 'Change plan' : 'See plans'}</Link>
          {hasPlan && !sub.cancelAtPeriodEnd && sub.status !== 'cancelled' && (
            confirmCancel ? (
              <>
                <button className="btn ghost sm warn-btn" disabled={busy} onClick={cancel}>Yes, cancel at period end</button>
                <button className="btn ghost sm" onClick={() => setConfirmCancel(false)}>Keep plan</button>
              </>
            ) : (
              <button className="btn ghost sm" onClick={() => setConfirmCancel(true)}>Cancel subscription</button>
            )
          )}
        </div>
      </section>
    </>
  );
}

function GoogleCredentialsCard() {
  const { settings, setSettings, notify } = useStore();
  const yt = settings.youtube;
  const [editing, setEditing] = useState(!yt.configured);
  const [clientId, setClientId] = useState(yt.clientId || '');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      setSettings(await api.saveCredentials({ clientId, clientSecret }));
      setClientSecret('');
      setEditing(false);
      notify('Google credentials saved. You can connect YouTube now.');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      setSettings(await api.removeCredentials());
      setClientId('');
      setEditing(true);
      notify('Google credentials removed');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const copy = (text) => navigator.clipboard?.writeText(text).then(() => notify('Copied'));

  return (
    <section className="card">
      <div className="card-head">
        <span className="card-icon"><KeyRound size={18} /></span>
        <div>
          <h2>Google API credentials</h2>
          <p className="muted">OAuth client used to upload to YouTube. Saved to <code>server/.env</code> and applied instantly, no restart needed.</p>
        </div>
      </div>

      {!editing ? (
        <div className="connected-row">
          <CheckCircle2 size={18} className="ok" />
          <div>
            <strong className="mono-trunc">{yt.clientId}</strong>
            <span className="muted">Secret {yt.secretHint}</span>
          </div>
          <button className="btn ghost sm" onClick={() => setEditing(true)}><Pencil size={14} /> Replace</button>
          <button className="btn ghost sm icon danger" title="Remove credentials" onClick={remove}><Trash2 size={14} /></button>
        </div>
      ) : (
        <form className="cred-form" onSubmit={save}>
          <ol className="steps">
            <li>In <a className="link" href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">Google Cloud Console</a>, enable <em>YouTube Data API v3</em>.</li>
            <li>Set up the OAuth consent screen and add your Google account as a test user.</li>
            <li>
              Create an <em>OAuth client ID</em> of type <em>Web application</em> with this redirect URI:
              <span className="copy-row">
                <code>{yt.redirectUri}</code>
                <button type="button" className="btn ghost sm icon" title="Copy" onClick={() => copy(yt.redirectUri)}><Copy size={13} /></button>
              </span>
            </li>
            <li>Paste the client ID and secret here.</li>
          </ol>
          <label className="stack">
            <span className="label">Client ID</span>
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} required autoComplete="off"
              spellCheck={false} placeholder="1234567890-abc123.apps.googleusercontent.com" />
          </label>
          <label className="stack">
            <span className="label">Client secret</span>
            <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
              autoComplete="new-password" spellCheck={false} required={!yt.configured}
              placeholder={yt.configured ? 'Leave blank to keep the current secret' : 'GOCSPX-…'} />
          </label>
          {yt.connected && <p className="hint warn">Changing the client ID disconnects your channel. You'll need to connect again.</p>}
          <div className="row">
            <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save credentials'}</button>
            {yt.configured && <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      )}
    </section>
  );
}

const FILTERS = {
  all: () => true,
  progress: (j) => ['queued', 'rendering', 'encoding', 'uploading'].includes(j.status),
  scheduled: (j) => Boolean(j.scheduledFor) && new Date(j.scheduledFor) > new Date(),
  ready: (j) => j.status === 'ready',
  published: (j) => j.status === 'published',
  failed: (j) => j.status === 'failed',
};
const FILTER_LABELS = { all: 'All', progress: 'In progress', scheduled: 'Scheduled', ready: 'Ready', published: 'Published', failed: 'Failed' };

function ShortsSection() {
  const { jobs, loadJobs, notify, categoryNames } = useStore();
  const [filter, setFilter] = useState('all');
  const list = jobs.filter(FILTERS[filter]);

  return (
    <section>
      <div className="toolbar">
        <h2>Your Shorts</h2>
        <Link to="/" className="btn ghost sm">New Short</Link>
      </div>
      <div className="chips-row">
        {Object.keys(FILTERS).map((f) => (
          <button key={f} className={`filter-chip${f === filter ? ' active' : ''}`} onClick={() => setFilter(f)}>
            {FILTER_LABELS[f]} <span>{jobs.filter(FILTERS[f]).length}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="empty">
          {jobs.length ? 'Nothing in this filter.' : <>No Shorts yet. <Link to="/" className="link">Pick a style</Link> to make one.</>}
        </div>
      ) : (
        <div className="job-grid">
          {list.map((j) => (
            <JobCard key={j.id} job={j} categoryName={categoryNames[j.category] || j.category} onChanged={loadJobs} notify={notify} />
          ))}
        </div>
      )}
    </section>
  );
}

function SettingsSection() {
  const { settings, setSettings, saveSettings } = useStore();
  if (!settings) return null;
  const slider = (key, min, max) => ({
    type: 'range', min, max, value: settings[key],
    onChange: (e) => setSettings({ ...settings, [key]: Number(e.target.value) }),
    onPointerUp: (e) => saveSettings({ [key]: Number(e.target.value) }),
    onKeyUp: (e) => saveSettings({ [key]: Number(e.target.value) }),
  });

  return (
    <>
    <section className="card">
      <div className="card-head">
        <span className="card-icon"><Settings2 size={18} /></span>
        <div>
          <h2>Video settings</h2>
          <p className="muted">Defaults for every new Short.</p>
        </div>
      </div>
      <div className="settings-grid">
        <label>
          <span className="label">Action length: {settings.drawSeconds}s</span>
          <input {...slider('drawSeconds', 8, 55)} />
        </label>
        <label>
          <span className="label">Finale: {settings.holdSeconds}s</span>
          <input {...slider('holdSeconds', 0, 5)} />
        </label>
        <label>
          <span className="label">Default visibility</span>
          <select value={settings.privacy} onChange={(e) => saveSettings({ privacy: e.target.value })}>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label>
          <span className="label">YouTube category</span>
          <select value={settings.categoryId} onChange={(e) => saveSettings({ categoryId: e.target.value })}>
            <option value="24">Entertainment</option>
            <option value="1">Film &amp; Animation</option>
            <option value="28">Science &amp; Technology</option>
            <option value="27">Education</option>
            <option value="26">Howto &amp; Style</option>
          </select>
        </label>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={settings.hookText} onChange={(e) => saveSettings({ hookText: e.target.checked })} />
        <span>Short quote at the top of the video (a new one every time)</span>
      </label>
      <label className="stack">
        <span className="label">Description footer</span>
        <textarea rows={3} defaultValue={settings.descriptionFooter} placeholder="Links, credits, call to action…"
          onBlur={(e) => saveSettings({ descriptionFooter: e.target.value })} />
      </label>
    </section>
    <MusicCard />
    </>
  );
}
