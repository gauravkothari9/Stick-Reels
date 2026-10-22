import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, Clock, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import ScheduleEditor from '../components/ScheduleEditor';
import { useStore } from '../store';

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // ISO weekday 1..7

export function formatWhen(date, timezone) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone,
  }).format(new Date(date));
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

function describeDays(days) {
  const key = [...days].sort().join('');
  if (key === '1234567') return 'Every day';
  if (key === '12345') return 'Weekdays';
  if (key === '67') return 'Weekends';
  return days.map((d) => DAY_LABELS[d - 1]).join(', ');
}

export default function ScheduleSection() {
  const { settings, categoryNames, notify, loadJobs } = useStore();
  const [schedules, setSchedules] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(() => (params.get('new') ? 'new' : null)); // null | 'new' | schedule

  useEffect(() => {
    if (params.get('new')) setParams({}, { replace: true });
  }, [params, setParams]);

  const load = useCallback(async () => {
    try {
      const [list, next] = await Promise.all([api.schedules(), api.upcoming()]);
      setSchedules(list);
      setUpcoming(next);
    } catch (e) {
      notify(e.message, 'error');
    }
  }, [notify]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const act = async (fn, msg) => {
    try {
      await fn();
      if (msg) notify(msg);
      load();
      loadJobs();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const perWeek = useMemo(
    () => (schedules || []).filter((s) => s.enabled).reduce((n, s) => n + s.days.length * s.times.length * s.perSlot, 0),
    [schedules],
  );
  const yt = settings?.youtube;

  return (
    <>
      <section className="section-hero">
        <div>
          <h2>Schedule</h2>
          <p className="muted">Pick days and times. Stick Reels renders a fresh Short before each slot and publishes it on time.</p>
        </div>
        <div className="stats">
          <div><strong>{schedules?.filter((s) => s.enabled).length ?? '–'}</strong><span>active</span></div>
          <div><strong>{perWeek}</strong><span>Shorts / week</span></div>
          <div><strong>{schedules?.reduce((n, s) => n + s.published, 0) ?? '–'}</strong><span>published</span></div>
        </div>
      </section>

      {settings && !yt?.connected && (
        <div className="banner warn">
          YouTube isn't connected, so scheduled Shorts will render but wait in Your Shorts.{' '}
          <Link to="/profile/account" className="link">Connect your channel</Link>
        </div>
      )}

      <div className="schedule-layout">
        <section>
          <div className="toolbar">
            <h3 className="toolbar-title">Your schedules</h3>
            <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New schedule</button>
          </div>

          {schedules && schedules.length === 0 && (
            <div className="empty">
              <CalendarClock size={28} />
              <p>No schedules yet. Create one and your channel posts on autopilot.</p>
              <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New schedule</button>
            </div>
          )}

          <div className="schedule-list">
            {schedules?.map((s) => (
              <article key={s.id} className={`schedule-card${s.enabled ? '' : ' off'}`}>
                <div className="schedule-top">
                  <div>
                    <h3>{s.name}</h3>
                    <span className="muted">
                      {s.categories.length
                        ? s.categories.slice(0, 3).map((c) => categoryNames[c] || c).join(', ') + (s.categories.length > 3 ? ` +${s.categories.length - 3}` : '')
                        : 'Any style (random)'}
                    </span>
                  </div>
                  <label className="switch" title={s.enabled ? 'Pause' : 'Resume'}>
                    <input type="checkbox" checked={s.enabled}
                      onChange={(e) => act(() => api.toggleSchedule(s.id, e.target.checked), e.target.checked ? 'Schedule resumed' : 'Schedule paused')} />
                    <span />
                  </label>
                </div>

                <div className="day-dots">
                  {DAY_LABELS.map((d, i) => <span key={d} className={s.days.includes(i + 1) ? 'on' : ''}>{d[0]}</span>)}
                  <span className="muted small">{describeDays(s.days)}</span>
                </div>
                <div className="time-chips">
                  {s.times.map((t) => <span key={t} className="chip"><Clock size={11} /> {formatTime(t)}</span>)}
                  <span className="muted small">{s.timezone}</span>
                </div>

                <div className="schedule-meta">
                  <span>{s.perSlot} per slot</span>
                  <span>· {s.privacy}</span>
                  <span>· {s.published} published</span>
                  {s.enabled && s.nextRunAt && <span className="next">Next: {formatWhen(s.nextRunAt)}</span>}
                  {s.enabled && s.note && <span className="next waiting">{s.note}</span>}
                </div>

                <div className="job-actions">
                  <button className="btn ghost sm" onClick={() => setEditing(s)}><Pencil size={14} /> Edit</button>
                  <button className="btn ghost sm" title="Make and publish one now"
                    onClick={() => act(() => api.runSchedule(s.id), 'Rendering now. See Your Shorts.')}>
                    <Play size={14} /> Run now
                  </button>
                  <button className="btn ghost sm icon danger" title="Delete schedule"
                    onClick={() => act(() => api.deleteSchedule(s.id), 'Schedule deleted')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="card upcoming">
          <h2>Coming up</h2>
          {upcoming.length === 0 ? (
            <p className="muted">Nothing scheduled.</p>
          ) : (
            <ol>
              {upcoming.map((u) => (
                <li key={`${u.scheduleId}-${u.at}`}>
                  <span className="when">{formatWhen(u.at)}</span>
                  <span className="muted">{u.name}{u.perSlot > 1 ? ` · ${u.perSlot} Shorts` : ''}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="hint">
            Rendering starts 20 minutes before each slot. Public Shorts go live at the exact time through YouTube's
            scheduler, even if this computer is off by then.
          </p>
        </aside>
      </div>

      {editing && (
        <ScheduleEditor
          schedule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}
