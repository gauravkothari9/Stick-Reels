import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Repeat, Search, Shuffle } from 'lucide-react';
import CategoryCard from '../components/CategoryCard';
import CreateModal from '../components/CreateModal';
import { rupees, useStore } from '../store';

export default function Dashboard() {
  const { categories, jobs, loadJobs, notify, categoryNames, hasPlan, account } = useStore();
  const [fromPrice, setFromPrice] = useState(null); // cheapest monthly plan, from the live plans
  useEffect(() => {
    if (!account || hasPlan) return;
    api.plans().then((d) => {
      const prices = d.plans.map((p) => p.monthly).filter((n) => n > 0);
      if (prices.length) setFromPrice(Math.min(...prices));
    }).catch(() => {});
  }, [account, hasPlan]);
  const [selected, setSelected] = useState(null);
  const [group, setGroup] = useState('All');
  const [query, setQuery] = useState('');
  const [surprising, setSurprising] = useState(false);
  const navigate = useNavigate();

  const surprise = async () => {
    setSurprising(true);
    try {
      const [job] = await api.createJobs({ category: 'random' });
      notify(`Creating a surprise ${categoryNames[job.category] || 'Short'}. Upload it when it's ready.`);
      loadJobs();
      navigate('/profile/shorts');
    } catch (e) {
      notify(e.message, 'error');
      setSurprising(false);
    }
  };

  const groups = useMemo(() => ['All', ...new Set(categories.map((c) => c.group))], [categories]);
  const visible = categories.filter((c) =>
    (group === 'All' || c.group === group) &&
    (!query || `${c.name} ${c.description} ${c.hashtags.join(' ')}`.toLowerCase().includes(query.toLowerCase())));

  const published = jobs.filter((j) => j.status === 'published').length;
  const inQueue = jobs.filter((j) => ['queued', 'rendering', 'encoding', 'uploading'].includes(j.status)).length;

  return (
    <>
      <section className="hero">
        <div>
          <h1>2D stickman Shorts, animated by code</h1>
          <p>
            Pick a style: fights, sports, dance, fitness or comedy. Every video gets new random moves, colors and music,
            and the finished Short goes to YouTube with a title, description and tags.
          </p>
        </div>
        <div className="stats">
          <div><strong>{categories.length}</strong><span>styles</span></div>
          <div><strong>{jobs.length}</strong><span>Shorts made</span></div>
          <div><strong>{published}</strong><span>published</span></div>
          <div><strong>{inQueue}</strong><span>in progress</span></div>
        </div>
      </section>

      {account && !hasPlan && (
        <div className="banner promo">
          <span>
            <strong>Free account.</strong>{' '}
            {account.usage.trialLeft ? 'Create 1 trial Short to see what Stick Reels can do.' : 'Your trial Short is used.'}
            {' '}{fromPrice ? `Plans start at ${rupees(fromPrice)}/month` : 'Paid plans include'} with YouTube uploads, scheduling and music.
          </span>
          <Link to="/pricing" className="btn primary sm">See plans</Link>
        </div>
      )}

      <section>
        <div className="toolbar">
          <h2>Choose a style</h2>
          <div className="toolbar-right">
            <label className="search">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search styles" />
            </label>
            <button className="btn ghost" disabled={!categories.length || surprising} onClick={surprise}
              title="Create a Short in a random style (it won't be uploaded until you click Upload)">
              <Shuffle size={15} /> Surprise me
            </button>
            <Link className="btn primary" to={hasPlan ? '/profile/schedule?new=1' : '/pricing'} title="Post automatically every day or on chosen days">
              <Repeat size={15} /> Autopilot
            </Link>
          </div>
        </div>
        <div className="chips-row" role="tablist">
          {groups.map((g) => (
            <button key={g} role="tab" aria-selected={g === group} className={`filter-chip${g === group ? ' active' : ''}`} onClick={() => setGroup(g)}>
              {g}
              <span>{g === 'All' ? categories.length : categories.filter((c) => c.group === g).length}</span>
            </button>
          ))}
        </div>

        {visible.length ? (
          <div className="category-grid">
            {visible.map((c) => <CategoryCard key={c.id} category={c} onSelect={setSelected} />)}
          </div>
        ) : (
          <div className="empty">No styles match “{query}”.</div>
        )}
      </section>

      {selected && <CreateModal category={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
