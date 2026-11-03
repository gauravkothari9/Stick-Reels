import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PlanTable from '../components/PlanTable';
import { useStore } from '../store';
import '../landing.css';

// The seven styles the landing page features. Descriptions and tags come from the API when loaded.
const FEATURED = [
  { id: 'sword_duel', name: 'Sword Duel', group: 'Action', description: 'Two stickmen clash swords under the moon until one is disarmed.' },
  { id: 'moonwalk', name: 'Moonwalk', group: 'Dance', description: 'Moonwalks, spins, toe stands and a gravity-defying lean.' },
  { id: 'basketball', name: 'Hoops', group: 'Sports', description: 'Crossovers, dunks and buzzer-beaters on a neon court.' },
  { id: 'pancake_chef', name: 'Pancake Chef', group: 'Music & Life', description: 'A chef flips a growing stack of pancakes higher and higher.' },
  { id: 'boxing', name: 'Boxing', group: 'Action', description: 'Jabs, hooks and an uppercut in a three-rope ring.' },
  { id: 'skateboard', name: 'Skate Tricks', group: 'Sports', description: 'Kickflips, grinds and drops through a night skatepark.' },
  { id: 'yoga', name: 'Yoga Flow', group: 'Fitness', description: 'A calm flow of poses with slow breathing cues.' },
];
// The hero reel shows the first four.
const REEL = FEATURED.slice(0, 4);
const preview = (id, ext = 'mp4') => `/media/previews/${id}.${ext}`;

// Server defaults, shown until the live prices arrive.
const FALLBACK_PLANS = [
  { id: 'basic', name: 'Basic', monthly: 2000, yearly: 20000, shortsPerPeriod: 10, schedules: 1, styles: 5, totalStyles: 52, ownMusic: false, priority: false },
  { id: 'pro', name: 'Pro', monthly: 3000, yearly: 30000, shortsPerPeriod: 30, schedules: 3, styles: 30, totalStyles: 52, ownMusic: true, priority: true },
  { id: 'max', name: 'Max', monthly: 5000, yearly: 50000, shortsPerPeriod: 400, schedules: null, styles: 52, totalStyles: 52, ownMusic: true, priority: true },
];

const STAGES = [
  { grow: 1, time: 'Seconds', text: 'First, pick a style or let Surprise me choose one.' },
  { grow: 3, time: 'A few minutes', text: 'Then the engine animates every frame and scores an original track.' },
  { grow: 1.6, time: 'About a minute', text: 'Next, the Short uploads to your channel with title and tags.' },
  { grow: 6, time: 'Every day after', text: 'After that, your schedule repeats it on the days and times you set.' },
];

const FIELDS = [
  {
    tone: 'blue', phrase: 'Never the same twice',
    text: 'Sword duels, moonwalks, dunks, yoga flows, pancake flips. Each render plans new moves, colours and camera shots, so no two Shorts come out alike.',
  },
  {
    tone: 'paper', phrase: 'Its own soundtrack',
    text: 'Every Short gets an original track composed to its exact length, in a mood that fits: epic for duels, funky for dance, zen for yoga. Pro and Max can upload their own music.',
  },
  {
    tone: 'surface', phrase: 'Tags written for you',
    text: 'Title, description and tags are built for each video. Your tags come first, then the style’s, then high-volume ones like #shorts, kept under YouTube’s 500-character limit.',
  },
  {
    tone: 'navy', phrase: 'Posts while you sleep',
    text: 'Connect your channel once. Autopilot schedules choose the days, times and styles. A failed upload waits for YouTube’s daily quota reset and goes out in order.',
  },
];

const FAQ = [
  ['Do I need to animate anything?', 'No. You choose a style, or let Surprise me pick one, and the engine draws every frame, adds the music and encodes a 1080×1920, 30 fps MP4 ready for Shorts.'],
  ['Will my Shorts all look alike?', 'No. Each render starts from a new random seed and palette, so the choreography, colours, shots and quote change every time, even within one style.'],
  ['Which channel does it post to?', 'Yours. You connect your YouTube channel through Google, and uploads go through the official YouTube Data API. You can disconnect at any time.'],
  ['What does a free account get?', 'You can browse the styles and make one watermarked trial Short. Uploading, scheduling and more Shorts start with a plan.'],
  ['Can I use my own music?', 'On Pro and Max you can upload your own tracks. Everyone else gets a generated track in a mood that matches the style, or one mood you pick for every Short.'],
  ['How do I pay, and can I cancel?', 'Plans are billed monthly or yearly in rupees through Razorpay. Cancel from Plan & billing; your plan keeps working until the paid period ends.'],
];

function useScrollReveal(root) {
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    el.classList.add('is-ready');
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.15 },
    );
    el.querySelectorAll('[data-reveal]').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [root]);
}

function Hero() {
  const ref = useRef(null);
  const reel = useRef(null);
  const [active, setActive] = useState(0);
  const [pastHero, setPastHero] = useState(false);

  // Only the clip in the window plays; the neighbours rest on their poster frame.
  useEffect(() => {
    const vids = reel.current?.querySelectorAll('video') || [];
    vids.forEach((v, i) => {
      if (i === active) v.play().catch(() => {});
      else v.pause();
    });
  }, [active]);

  // The stage is sticky; scrolling through the section moves the reel one frame per step.
  useEffect(() => {
    const section = ref.current;
    let frame = 0;
    const update = () => {
      frame = 0;
      const wide = window.matchMedia('(min-width: 1000px)').matches;
      const track = reel.current;
      if (!wide || !track) {
        setPastHero(section.getBoundingClientRect().bottom < 80);
        if (track) track.style.transform = '';
        return;
      }
      const rect = section.getBoundingClientRect();
      setPastHero(rect.bottom < 80);
      const run = section.offsetHeight - window.innerHeight;
      const p = Math.min(1, Math.max(0, -rect.top / run));
      const first = track.children[0];
      const step = first.offsetHeight + 24;
      const pos = p * (REEL.length - 1);
      track.style.transform = `translate3d(0, ${-pos * step}px, 0)`;
      setActive(Math.round(pos));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <section className="lp-hero" ref={ref}>
      <div className={`lp-bar-nav ${pastHero ? 'is-on' : ''}`} aria-hidden={!pastHero} inert={!pastHero}>
        <Link to="/" className="lp-wordmark">
          <img src="/logo-mark.png" alt="" width="400" height="283" />
          <span>Stick Reels</span>
        </Link>
        <div className="lp-links">
          <a href="#styles" className="hide-phone">Styles</a>
          <a href="#pricing" className="hide-phone">Pricing</a>
          <Link to="/login">Log in</Link>
          <Link to="/signup" className="lp-btn small">Start free</Link>
        </div>
      </div>
      <div className="lp-stage">
        <nav className="lp-nav" aria-label="Main">
          <Link to="/" className="lp-wordmark">
            <img src="/logo-mark.png" alt="" width="400" height="283" />
            <span>Stick Reels</span>
          </Link>
          <div className="lp-links">
            <a href="#styles" className="hide-phone">Styles</a>
            <a href="#how" className="hide-phone">How it works</a>
            <a href="#pricing">Pricing</a>
            <Link to="/login">Log in</Link>
            <Link to="/signup" className="lp-btn small">Start free</Link>
          </div>
        </nav>

        <h1 className="lp-sentence">
          <span className="lp-half lp-half-a">Your channel</span>{' '}
          <span className="lp-half lp-half-b">posts itself</span>
        </h1>

        <div className="lp-window" aria-label="Shorts made by Stick Reels">
          <div className="lp-reel" ref={reel}>
            {REEL.map((r, i) => (
              <figure key={r.id} className={`lp-frame ${i === active ? 'is-active' : ''}`}>
                <video
                  src={preview(r.id)}
                  poster={preview(r.id, 'jpg')}
                  autoPlay={i === 0} muted loop playsInline
                  preload={i === 0 ? 'auto' : 'none'}
                  aria-label={`${r.name} Short`}
                />
              </figure>
            ))}
          </div>
        </div>

        <div className="lp-hero-foot">
          <p className="lp-support">
            Stick Reels animates original stick-figure Shorts, scores them with music and uploads them to your YouTube channel on a schedule.
          </p>
          <Link to="/signup" className="lp-btn">Make your first Short free</Link>
        </div>
        <p className="lp-now" aria-live="polite">Now playing: {REEL[active].name}</p>
      </div>
    </section>
  );
}

function StyleFinder() {
  const { categories } = useStore();
  const [picked, setPicked] = useState(FEATURED[1].id);
  // Live description and tags from the API, falling back to the built-in copy.
  const styles = useMemo(() => FEATURED.map((f) => ({ hashtags: [], ...f, ...categories.find((c) => c.id === f.id), name: f.name })), [categories]);
  const shown = styles.find((c) => c.id === picked) || styles[0];

  return (
    <section className="lp-sec lp-finder" id="styles" data-reveal>
      <div className="lp-finder-copy">
        <h2 className="lp-head" data-rise style={{ '--i': 0 }}>Seven styles to start</h2>
        <ul className="lp-style-list" data-rise style={{ '--i': 1 }}>
          {styles.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`lp-style ${c.id === shown.id ? 'is-on' : ''}`}
                aria-pressed={c.id === shown.id}
                onClick={() => setPicked(c.id)}
                onMouseEnter={() => setPicked(c.id)}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="lp-finder-side" data-rise style={{ '--i': 2 }}>
        <figure className="lp-finder-media">
          <video key={shown.id} src={preview(shown.id)} poster={preview(shown.id, 'jpg')} autoPlay muted loop playsInline aria-label={`${shown.name} preview`} />
        </figure>
        <div className="lp-answer" aria-live="polite">
          <p className="lp-answer-name">{shown.name} <span>· {shown.group}</span></p>
          <p>{shown.description}</p>
          {shown.hashtags.length > 0 && (
            <p className="lp-tags">{shown.hashtags.map((h) => `#${h.replace(/\s+/g, '')}`).join('  ')}  #shorts</p>
          )}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="lp-sec lp-how" id="how" data-reveal>
      <h2 className="lp-head" data-rise style={{ '--i': 0 }}>Set it up once</h2>
      <ol className="lp-bar" data-ui>
        {STAGES.map((s, i) => (
          <li key={s.time} style={{ '--grow': s.grow, '--i': i + 1 }} data-rise>
            <div className={`lp-seg seg-${i}`}><span>{s.time}</span></div>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Fields() {
  return (
    <div className="lp-fields">
      {FIELDS.map((f, i) => (
        <section key={f.phrase} className={`lp-field field-${f.tone} ${i % 2 ? 'mirror' : ''}`} data-reveal>
          <p className="lp-field-text" data-rise style={{ '--i': 0 }}>{f.text}</p>
          <h2 className="lp-field-phrase" data-rise style={{ '--i': 1 }}>{f.phrase}</h2>
        </section>
      ))}
    </div>
  );
}

function PricingTable() {
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [yearly, setYearly] = useState(false);

  useEffect(() => {
    api.plans().then((d) => d.plans?.length && setPlans(d.plans)).catch(() => {});
  }, []);

  // "2 months free" when every plan's yearly price is a whole number of months cheaper
  const saving = (() => {
    const free = plans.map((p) => 12 - p.yearly / p.monthly);
    const n = Math.round(free[0]);
    return n >= 1 && free.every((f) => Math.abs(f - n) < 0.01) ? `${n} months free` : null;
  })();

  return (
    <section className="lp-sec lp-pricing" id="pricing" data-reveal>
      <h2 className="lp-head lp-pricing-head" data-rise style={{ '--i': 0 }}>Pick your pace</h2>
      <div data-rise style={{ '--i': 1 }}>
        <PlanTable
          className="lp-plan-table"
          showTitle={false}
          plans={plans}
          period={yearly ? 'yearly' : 'monthly'}
          action={(id) => (
            <Link
              to={id === 'free' ? '/signup' : `/signup?next=${encodeURIComponent('/pricing')}`}
              className={`lp-btn ${id === 'pro' ? '' : 'quiet'}`}
            >
              {id === 'free' ? 'Start free' : `Choose ${plans.find((p) => p.id === id)?.name}`}
            </Link>
          )}
        />
      </div>
      <p className="lp-plan-note" data-rise style={{ '--i': 2 }}>
        <button type="button" className="lp-textlink" onClick={() => setYearly((y) => !y)} aria-pressed={yearly}>
          {yearly ? 'Show monthly prices' : `Show yearly prices${saving ? ` (${saving})` : ''}`}
        </button>
        {' '}· Prices in rupees, billed through Razorpay. Cancel anytime.
      </p>
    </section>
  );
}

function Faq() {
  return (
    <section className="lp-sec lp-faq" id="faq" data-reveal>
      <div className="lp-faq-row">
        <h2 className="lp-q lp-faq-title" data-rise style={{ '--i': 0 }}>Questions</h2>
      </div>
      {FAQ.map(([q, a], i) => (
        <div className="lp-faq-row" key={q} data-rise style={{ '--i': i + 1 }}>
          <h3 className="lp-q">{q}</h3>
          <p>{a}</p>
        </div>
      ))}
    </section>
  );
}

/** Strip of real renders: the clips load and play only while the strip is on screen. */
function ClipStrip() {
  const ref = useRef(null);
  useEffect(() => {
    const list = ref.current;
    if (!list) return undefined;
    const visible = new Set();
    const tryPlay = (v) => visible.has(v) && v.play().catch(() => {});
    // one observer entry per clip; a clip that was not ready yet starts once it can play
    const io = new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting }) => {
      if (isIntersecting) {
        visible.add(v);
        tryPlay(v);
      } else {
        visible.delete(v);
        v.pause();
      }
    }), { threshold: 0.1 });
    const videos = [...list.querySelectorAll('video')];
    const onReady = (e) => tryPlay(e.currentTarget);
    videos.forEach((v) => {
      io.observe(v);
      v.addEventListener('canplay', onReady);
    });
    return () => {
      io.disconnect();
      videos.forEach((v) => v.removeEventListener('canplay', onReady));
    };
  }, []);
  return (
    <ul className="lp-strip" ref={ref}>
      {FEATURED.map((s, i) => (
        <li key={s.id} data-rise style={{ '--i': i + 1 }}>
          <video src={preview(s.id)} poster={preview(s.id, 'jpg')} muted loop playsInline preload="metadata"
            width="360" height="640" aria-label={`${s.name} Short`} />
        </li>
      ))}
    </ul>
  );
}

function Close() {
  return (
    <section className="lp-close" data-reveal>
      <h2 className="lp-close-head" data-rise style={{ '--i': 0 }}>Let it post itself</h2>
      <ClipStrip />
      <div className="lp-close-foot" data-rise style={{ '--i': 1 }}>
        <p>Free to join. Your first Short is on us, rendered in a few minutes.</p>
        <Link to="/signup" className="lp-btn">Create your free account</Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-top">
        <div>
          <p className="lp-footer-invite">Make one today</p>
          <a href="#styles" className="lp-btn">Browse the styles</a>
        </div>
        <ul className="lp-footer-links">
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="#faq">Questions</a></li>
          <li><Link to="/login">Log in</Link></li>
          <li><Link to="/signup">Sign up</Link></li>
        </ul>
      </div>
      <div className="lp-legal">
        <span>© {new Date().getFullYear()} Stick Reels</span>
        <span>Original stick-figure Shorts for YouTube</span>
      </div>
      <p className="lp-bigname" aria-hidden="true">Stick Reels</p>
    </footer>
  );
}

export default function Landing() {
  const root = useRef(null);
  useScrollReveal(root);
  return (
    <div className="lp" ref={root}>
      <Hero />
      <StyleFinder />
      <HowItWorks />
      <Fields />
      <PricingTable />
      <Faq />
      <Close />
      <Footer />
    </div>
  );
}
