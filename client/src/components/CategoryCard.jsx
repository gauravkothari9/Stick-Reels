import { useEffect, useRef } from 'react';
import { Loader2, Lock } from 'lucide-react';

/** Style card. The preview video only plays while the card is on screen. */
const PLAN_NAMES = { basic: 'Basic', pro: 'Pro', max: 'Max' };

export default function CategoryCard({ category, onSelect, locked = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }, { threshold: 0.35 });
    io.observe(video);
    return () => io.disconnect();
  }, [category.previewUrl]);

  return (
    <button type="button" className={`category-card${locked ? ' locked' : ''}`} onClick={() => onSelect(category)}
      aria-label={locked ? `${category.name}, on the ${PLAN_NAMES[category.plan] || 'higher'} plan` : undefined}>
      <div className="category-media">
        {category.previewUrl ? (
          <video ref={videoRef} src={category.previewUrl} poster={category.posterUrl} muted loop playsInline preload="none" />
        ) : (
          <div className="preview-pending">
            <Loader2 className="spin" size={22} />
            <span>Rendering preview…</span>
          </div>
        )}
        <span className="group-badge">{category.group}</span>
        {category.published > 0 && <span className="count-badge">{category.published} published</span>}
        {locked && <span className="lock-badge"><Lock size={12} /> {PLAN_NAMES[category.plan] || 'Upgrade'}</span>}
      </div>
      <div className="category-body">
        <span className="category-name">{category.name}</span>
        <span className="category-desc">{category.description}</span>
      </div>
    </button>
  );
}
