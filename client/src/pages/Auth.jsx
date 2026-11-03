import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { api } from '../api';
import { useStore } from '../store';
import '../landing.css';

// Rendered Shorts that play beside the form, one after another.
const CLIPS = [
  { id: 'moonwalk', name: 'Moonwalk' },
  { id: 'sword_duel', name: 'Sword Duel' },
  { id: 'pancake_chef', name: 'Pancake Chef' },
  { id: 'basketball', name: 'Hoops' },
];

function safeNext(params) {
  const next = params.get('next') || '/';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
const withNext = (path, params) => (params.get('next') ? `${path}?next=${encodeURIComponent(params.get('next'))}` : path);

function AuthShell({ title, lead, children, footer, points }) {
  const [clip, setClip] = useState(0);
  // Move to the next clip every few seconds.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setInterval(() => setClip((c) => (c + 1) % CLIPS.length), 6000);
    return () => clearInterval(id);
  }, []);
  const c = CLIPS[clip];

  return (
    <div className="lp lp-auth">
      <div className="lp-auth-main">
        <Link to="/" className="lp-wordmark">
          <img src="/logo-mark.png" alt="" width="400" height="283" />
          <span>Stick Reels</span>
        </Link>
        <div className="lp-auth-body">
          <h1 className="lp-auth-title">{title}</h1>
          <p className="lp-auth-lead">{lead}</p>
          {children}
          <p className="lp-auth-footer">{footer}</p>
        </div>
      </div>
      <aside className="lp-auth-side" aria-label="Shorts made by Stick Reels">
        <video key={c.id} src={`/media/previews/${c.id}.mp4`} poster={`/media/previews/${c.id}.jpg`}
          autoPlay muted loop playsInline aria-label={`${c.name} Short`} />
        <div className="lp-auth-caption">
          {points && (
            <ul className="lp-auth-points">
              {points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          <p>{c.name}, rendered by Stick Reels</p>
        </div>
      </aside>
    </div>
  );
}

function Field({ id, label, hint, error, children }) {
  return (
    <div className={`lp-field-row${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="lp-hint">{hint}</p>}
      {error && <p id={`${id}-error`} className="lp-error" role="alert">{error}</p>}
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, describedBy, invalid }) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const onKey = (e) => setCaps(Boolean(e.getModifierState?.('CapsLock')));
  return (
    <>
      <span className="lp-password">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete}
          required minLength={autoComplete === 'new-password' ? 8 : undefined}
          aria-describedby={describedBy} aria-invalid={invalid || undefined} onKeyUp={onKey} onKeyDown={onKey} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      {caps && <p className="lp-hint">Caps Lock is on.</p>}
    </>
  );
}

export function Login() {
  const { account, setAccount } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (account) return <Navigate to={safeNext(params)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setAccount(await api.login({ email: form.email.trim(), password: form.password }));
      navigate(safeNext(params), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      lead="Log in to Stick Reels to make, schedule and upload your stick-figure Shorts."
      footer={<>New to Stick Reels? <Link to={withNext('/signup', params)} className="lp-textlink">Create a free account</Link></>}
    >
      <form className="lp-auth-form" onSubmit={submit} noValidate={false} aria-busy={busy}>
        <Field id="login-email" label="Email">
          <input id="login-email" type="email" value={form.email} autoComplete="email" required autoFocus
            inputMode="email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field id="login-password" label="Password">
          <PasswordInput id="login-password" value={form.password} autoComplete="current-password"
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <p className="lp-error lp-form-error" role="alert">{error}</p>}
        <button className="lp-btn lp-auth-submit" disabled={busy}>
          {busy && <Loader2 className="spin" size={18} />} {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthShell>
  );
}

export function Signup() {
  const { account, setAccount } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', agree: false });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (account) return <Navigate to={safeNext(params)} replace />;
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    // clear a field's error as soon as it is edited
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter an email like you@example.com.';
    if (form.password.length < 8) e.password = 'Use at least 8 characters.';
    if (!form.agree) e.agree = 'Accept the terms to continue.';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setError('');
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(`signup-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      setAccount(await api.signup({ name: form.name.trim(), email: form.email.trim(), password: form.password }));
      navigate(safeNext(params), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const describe = (id) => (errors[id] ? `signup-${id}-error` : `signup-${id}-hint`);

  return (
    <AuthShell
      title="Start for free"
      lead="Stick Reels turns stick-figure animation into YouTube Shorts. Make your first one free, no card needed."
      points={['One free trial Short, rendered in minutes', 'Browse every style before you pick a plan', 'A plan adds YouTube uploads and autopilot']}
      footer={<>Already have an account? <Link to={withNext('/login', params)} className="lp-textlink">Log in</Link></>}
    >
      <form className="lp-auth-form" onSubmit={submit} noValidate aria-busy={busy}>
        <Field id="signup-name" label="Your name" error={errors.name}>
          <input id="signup-name" value={form.name} autoComplete="name" required autoFocus maxLength={80}
            aria-invalid={Boolean(errors.name) || undefined} aria-describedby={errors.name ? 'signup-name-error' : undefined}
            onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field id="signup-email" label="Email" error={errors.email}>
          <input id="signup-email" type="email" value={form.email} autoComplete="email" required inputMode="email"
            aria-invalid={Boolean(errors.email) || undefined} aria-describedby={errors.email ? 'signup-email-error' : undefined}
            onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field id="signup-password" label="Password" hint="At least 8 characters." error={errors.password}>
          <PasswordInput id="signup-password" value={form.password} autoComplete="new-password"
            describedBy={describe('password')} invalid={Boolean(errors.password)}
            onChange={(e) => set({ password: e.target.value })} />
        </Field>
        <div className={`lp-check${errors.agree ? ' has-error' : ''}`}>
          <input id="signup-agree" type="checkbox" checked={form.agree} onChange={(e) => set({ agree: e.target.checked })}
            aria-invalid={Boolean(errors.agree) || undefined} aria-describedby={errors.agree ? 'signup-agree-error' : undefined} />
          <label htmlFor="signup-agree">I agree to the Terms of Service and Privacy Policy</label>
          {errors.agree && <p id="signup-agree-error" className="lp-error" role="alert">{errors.agree}</p>}
        </div>
        {error && <p className="lp-error lp-form-error" role="alert">{error}</p>}
        <button className="lp-btn lp-auth-submit" disabled={busy}>
          {busy && <Loader2 className="spin" size={18} />} {busy ? 'Creating your account…' : 'Create free account'}
        </button>
      </form>
    </AuthShell>
  );
}
