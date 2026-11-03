import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronDown, Clapperboard, CreditCard, Crown, LayoutGrid, LogOut, UserRound } from 'lucide-react';
import { useStore } from '../store';
import YoutubeIcon from './YoutubeIcon';

function UserMenu() {
  const { user, account, logout } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const go = (to) => {
    setOpen(false);
    navigate(to);
  };
  const planLabel = user.role === 'admin' ? 'Admin' : account.plan ? account.plan[0].toUpperCase() + account.plan.slice(1) : 'Free';

  return (
    <div className="user-menu" ref={ref}>
      <button className="user-button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <span className="avatar">{user.name.trim()[0]?.toUpperCase() || '?'}</span>
        <span className={`plan-badge ${account.plan ? 'paid' : ''}`}>{planLabel}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{user.name}</strong>
            <span className="muted">{user.email}</span>
          </div>
          <button role="menuitem" onClick={() => go('/profile/account')}><UserRound size={15} /> Profile</button>
          <button role="menuitem" onClick={() => go('/profile/billing')}><CreditCard size={15} /> Plan &amp; billing</button>
          <button role="menuitem" onClick={async () => {
            setOpen(false);
            await logout();
            navigate('/login');
          }}><LogOut size={15} /> Log out</button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { account, settings, hasPlan } = useStore();
  const yt = settings?.youtube;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link to="/" className="brand">
          <img className="logo" src="/logo-mark.png" alt="" />
          <span className="brand-name">Stick <span className="brand-accent">Reels</span></span>
        </Link>
        {account && (
          <nav className="nav">
            <NavLink to="/" end><LayoutGrid size={16} /> Dashboard</NavLink>
            <NavLink to="/profile"><UserRound size={16} /> Profile</NavLink>
            {!hasPlan && <NavLink to="/pricing"><Crown size={16} /> Pricing</NavLink>}
          </nav>
        )}
      </div>

      {account === null && (
        <div className="topbar-right">
          <NavLink to="/pricing" className="btn ghost hide-sm">Pricing</NavLink>
          <Link to="/login" className="btn ghost">Log in</Link>
          <Link to="/signup" className="btn primary">Sign up free</Link>
        </div>
      )}

      {account && (
        <div className="topbar-right">
          {settings && (yt?.connected ? (
            <Link to="/profile/account" className="yt-status" title="YouTube connected">
              <span className="yt-icon"><YoutubeIcon size={16} /></span>
              <span className="yt-name">{yt.channelTitle}</span>
              <span className="yt-dot" aria-label="Connected" />
            </Link>
          ) : (
            // Goes to the Account page first, which explains picking your own Google account.
            <Link className="btn yt" to="/profile/account">
              <YoutubeIcon size={16} /> Connect YouTube
            </Link>
          ))}
          <UserMenu />
        </div>
      )}

      {/* Phones: the main sections as a bottom tab bar, within thumb reach */}
      {account && (
        <nav className="tabbar" aria-label="Main">
          <NavLink to="/" end><LayoutGrid size={20} /><span>Styles</span></NavLink>
          <NavLink to="/profile/shorts"><Clapperboard size={20} /><span>Shorts</span></NavLink>
          <NavLink to="/profile/schedule"><CalendarClock size={20} /><span>Autopilot</span></NavLink>
          {hasPlan
            ? <NavLink to="/profile/account"><UserRound size={20} /><span>Profile</span></NavLink>
            : <NavLink to="/pricing"><Crown size={20} /><span>Plans</span></NavLink>}
        </nav>
      )}
    </header>
  );
}
