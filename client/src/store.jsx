import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, authEvents } from './api';

const ACTIVE = ['queued', 'rendering', 'encoding', 'uploading'];
const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  // account: undefined = still checking the session, null = logged out
  const [account, setAccount] = useState(undefined);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();
  const loggedIn = Boolean(account);

  const notify = useCallback((text, tone = 'ok') => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const loadAccount = useCallback(() => api.me().then(setAccount).catch(() => setAccount(null)), []);
  const loadJobs = useCallback(() => api.jobs().then(setJobs).catch(() => {}), []);
  const loadCategories = useCallback(() => api.categories().then(setCategories).catch(() => {}), []);
  const loadSettings = useCallback(() => api.settings().then(setSettings).catch(() => {}), []);

  useEffect(() => {
    loadAccount();
    loadCategories();
    const onLogout = () => setAccount(null);
    authEvents.addEventListener('logout', onLogout);
    return () => authEvents.removeEventListener('logout', onLogout);
  }, [loadAccount, loadCategories]);

  // per-user data only once logged in; cleared on logout
  useEffect(() => {
    if (loggedIn) {
      loadJobs();
      loadSettings();
      loadCategories();
    } else {
      setJobs([]);
      setSettings(null);
    }
  }, [loggedIn, loadJobs, loadSettings, loadCategories]);

  const busy = jobs.some((j) => ACTIVE.includes(j.status));
  const previewsPending = categories.some((c) => !c.previewUrl);
  useEffect(() => {
    if (!loggedIn) return undefined;
    const id = setInterval(loadJobs, busy ? 1500 : 8000);
    return () => clearInterval(id);
  }, [loggedIn, busy, loadJobs]);
  useEffect(() => {
    if (!previewsPending && !busy) return undefined;
    const id = setInterval(loadCategories, 6000);
    return () => clearInterval(id);
  }, [previewsPending, busy, loadCategories]);
  // usage counters change as Shorts are created
  useEffect(() => {
    if (loggedIn) loadAccount();
  }, [loggedIn, jobs.length, loadAccount]);

  const saveSettings = useCallback(async (patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    try {
      setSettings(await api.saveSettings(patch));
    } catch (e) {
      notify(e.message, 'error');
    }
  }, [notify]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setAccount(null);
  }, []);

  // Styles this account can make: paid plans unlock a share; free accounts may try any style once.
  const allowed = useMemo(
    () => (account?.access && account.usage?.allowedStyles ? new Set(account.usage.allowedStyles) : null),
    [account],
  );
  const canUseStyle = useCallback((id) => !allowed || allowed.has(id), [allowed]);

  const value = useMemo(() => ({
    account, setAccount, loadAccount, logout,
    user: account?.user || null,
    hasPlan: Boolean(account?.access),
    categories, settings, setSettings, saveSettings, jobs, loadJobs, loadCategories, notify, toast,
    categoryNames: Object.fromEntries(categories.map((c) => [c.id, c.name])),
    canUseStyle,
  }), [account, loadAccount, logout, categories, settings, saveSettings, jobs, loadJobs, loadCategories, notify, toast, canUseStyle]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);

export const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
