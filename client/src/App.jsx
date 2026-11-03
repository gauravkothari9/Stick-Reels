import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { authEvents } from './api';
import Header from './components/Header';
import { Login, Signup } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';
import Profile from './pages/Profile';
import { useStore } from './store';

const SIGNED_IN_KEY = 'sr-signed-in';
function wasSignedIn() {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

function ScheduleRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/profile/schedule${search}`} replace />;
}

/** Logged-in pages. While the session check runs, show a spinner instead of flashing the login page. */
function Protected({ children }) {
  const { account } = useStore();
  const { pathname, search } = useLocation();
  if (account === undefined) return <div className="empty"><Loader2 className="spin" size={22} /></div>;
  if (!account) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  return children;
}

export default function App() {
  const { toast, notify, account } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Any request that needs a plan (402) lands the user on Pricing with the reason.
  useEffect(() => {
    const onPaywall = (e) => {
      notify(e.detail, 'error');
      navigate('/pricing');
    };
    authEvents.addEventListener('paywall', onPaywall);
    return () => authEvents.removeEventListener('paywall', onPaywall);
  }, [navigate, notify]);

  // Remember whether this browser was signed in, so the landing page can paint before the session check returns.
  useEffect(() => {
    if (account === undefined) return;
    try {
      if (account) localStorage.setItem(SIGNED_IN_KEY, '1');
      else localStorage.removeItem(SIGNED_IN_KEY);
    } catch { /* storage blocked */ }
  }, [account]);

  // Full-bleed pages without the app shell: the landing page for logged-out visitors on "/",
  // and the log in / sign up screens.
  const toastEl = toast && <div className={`toast ${toast.tone}`} role="status">{toast.text}</div>;
  if (pathname === '/' && (account === null || (account === undefined && !wasSignedIn()))) {
    return <><Landing />{toastEl}</>;
  }
  if (pathname === '/login') return <><Login />{toastEl}</>;
  if (pathname === '/signup') return <><Signup />{toastEl}</>;

  return (
    <div className="app">
      <Header />
      <main>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/schedule" element={<ScheduleRedirect />} />
          <Route path="/profile" element={<Navigate to="/profile/account" replace />} />
          <Route path="/profile/:section" element={<Protected><Profile /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {toast && <div className={`toast ${toast.tone}`} role="status">{toast.text}</div>}
    </div>
  );
}
