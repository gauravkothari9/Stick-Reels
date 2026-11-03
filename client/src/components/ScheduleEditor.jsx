import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { api } from '../api';
import { useStore } from '../store';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // ISO weekday 1..7
const PRESETS = { 'Every day': [1, 2, 3, 4, 5, 6, 7], Weekdays: [1, 2, 3, 4, 5], Weekends: [6, 7] };
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const allTimezones = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [browserTz];
  }
})();

export default function ScheduleEditor({ schedule, onClose, onSaved }) {
  const { categories, settings, notify, canUseStyle } = useStore();
  const [form, setForm] = useState(() => schedule
    ? { ...schedule }
    : { name: '', categories: [], days: [1, 3, 5], times: ['18:00'], timezone: browserTz,
        privacy: settings?.privacy || 'public', perSlot: 1, enabled: true });
  const [anyStyle, setAnyStyle] = useState(!schedule?.categories?.length);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const grouped = useMemo(() => {
    const q = query.toLowerCase();
    const out = {};
    for (const c of categories) {
      if (q && !c.name.toLowerCase().includes(q)) continue;
      (out[c.group] ||= []).push(c);
    }
    return out;
  }, [categories, query]);

  const toggleDay = (d) => set({ days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d].sort() });
  const toggleCat = (id) => set({ categories: form.categories.includes(id) ? form.categories.filter((x) => x !== id) : [...form.categories, id] });
  const setTime = (i, v) => set({ times: form.times.map((t, j) => (j === i ? v : t)) });

  const save = async (e) => {
    e.preventDefault();
    if (!anyStyle && !form.categories.length) return notify('Pick at least one style, or choose Any style', 'error');
    setSaving(true);
    try {
      const payload = { ...form, categories: anyStyle ? [] : form.categories, times: form.times.filter(Boolean) };
      if (schedule) await api.updateSchedule(schedule.id, payload);
      else await api.createSchedule(payload);
      notify(schedule ? 'Schedule updated' : 'Schedule created');
      onSaved();
    } catch (err) {
      notify(err.message, 'error');
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal editor" role="dialog" aria-modal="true" aria-labelledby="sched-title" onSubmit={save}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="modal-body">
          <span className="eyebrow">Autopilot</span>
          <h2 id="sched-title">{schedule ? 'Edit schedule' : 'New schedule'}</h2>

          <label className="stack">
            <span className="label">Name</span>
            <input value={form.name} maxLength={60} required placeholder="e.g. Weekday evening Shorts"
              onChange={(e) => set({ name: e.target.value })} />
          </label>

          <div className="field">
            <span className="label">Days</span>
            <div className="day-picker">
              {DAYS.map((d, i) => (
                <button key={d} type="button" className={form.days.includes(i + 1) ? 'on' : ''} aria-pressed={form.days.includes(i + 1)}
                  onClick={() => toggleDay(i + 1)}>{d}</button>
              ))}
            </div>
            <div className="row">
              {Object.entries(PRESETS).map(([label, days]) => (
                <button key={label} type="button" className="filter-chip" onClick={() => set({ days })}>{label}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">Times</span>
            <div className="time-list">
              {form.times.map((t, i) => (
                <span key={i} className="time-input">
                  <input type="time" value={t} required onChange={(e) => setTime(i, e.target.value)} />
                  {form.times.length > 1 && (
                    <button type="button" aria-label="Remove time" onClick={() => set({ times: form.times.filter((_, j) => j !== i) })}>
                      <X size={13} />
                    </button>
                  )}
                </span>
              ))}
              {form.times.length < 12 && (
                <button type="button" className="btn ghost sm" onClick={() => set({ times: [...form.times, '12:00'] })}>
                  <Plus size={14} /> Add time
                </button>
              )}
            </div>
          </div>

          <div className="field two">
            <label>
              <span className="label">Timezone</span>
              <select value={form.timezone} onChange={(e) => set({ timezone: e.target.value })}>
                {allTimezones.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Visibility</span>
              <select value={form.privacy} onChange={(e) => set({ privacy: e.target.value })}>
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </label>
          </div>

          <label className="stack">
            <span className="label">Shorts per slot</span>
            <select value={form.perSlot} onChange={(e) => set({ perSlot: Number(e.target.value) })}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>

          <div className="field">
            <span className="label">Styles</span>
            <div className="row">
              <button type="button" className={`filter-chip${anyStyle ? ' active' : ''}`} onClick={() => setAnyStyle(true)}>
                Any style (random)
              </button>
              <button type="button" className={`filter-chip${!anyStyle ? ' active' : ''}`} onClick={() => setAnyStyle(false)}>
                Choose styles {form.categories.length ? <span>{form.categories.length}</span> : null}
              </button>
            </div>
            {!anyStyle && (
              <div className="style-picker">
                <label className="search">
                  <Search size={15} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search styles" />
                </label>
                <div className="style-groups">
                  {Object.entries(grouped).map(([group, list]) => (
                    <div key={group}>
                      <span className="group-label">{group}</span>
                      <div className="row wrap">
                        {list.map((c) => {
                          const locked = !canUseStyle(c.id);
                          return (
                            <button key={c.id} type="button" disabled={locked}
                              className={`filter-chip${form.categories.includes(c.id) ? ' active' : ''}${locked ? ' locked' : ''}`}
                              title={locked ? `On the ${{ basic: 'Basic', pro: 'Pro', max: 'Max' }[c.plan] || 'higher'} plan` : undefined}
                              onClick={() => toggleCat(c.id)}>{c.name}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <span className="hint">Selected styles take turns, one after another.</span>
              </div>
            )}
          </div>

          <button className="btn primary block lg" disabled={saving}>
            {saving && <Loader2 className="spin" size={16} />} {schedule ? 'Save changes' : 'Create schedule'}
          </button>
        </div>
      </form>
    </div>
  );
}
