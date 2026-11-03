import { rupees } from '../store';

/** One column per plan: Free plus the paid plans from the API, compared row by row. */
const ROWS = [
  ['Shorts a month', () => 'One trial Short', (p) => `${p.shortsPerPeriod} Shorts`],
  ['Autopilot schedules', () => 'Not included', (p) => (p.schedules == null ? 'Unlimited' : String(p.schedules))],
  ['Styles', (total) => `Browse all ${total}`, (p) => `${p.styles} styles`],
  ['Upload to YouTube', () => 'Not included', () => 'Automatic'],
  ['Watermark', () => 'Yes', () => 'None'],
  ['Your own music', () => 'Not included', (p) => (p.ownMusic ? 'Included' : 'Not included')],
  ['Rendering', () => 'Standard', (p) => (p.priority ? 'Priority' : 'Standard')],
];

const NEGATIVE = new Set(['Not included', 'Yes']);

/**
 * @param plans    paid plans from /api/billing/plans
 * @param period   'monthly' | 'yearly'
 * @param action   (planId: 'free' | plan id) => ReactNode for the last row, or null for none
 * @param featured plan id to highlight
 */
export default function PlanTable({ plans, period = 'monthly', action, featured = 'pro', title = 'Pick your pace', showTitle = true, className = '' }) {
  const total = plans[0]?.totalStyles || 52;
  const cols = [{ id: 'free', name: 'Free', price: 0, unit: 'forever' }, ...plans.map((p) => ({
    ...p,
    price: period === 'yearly' ? p.yearly : p.monthly,
    unit: period === 'yearly' ? 'a year' : 'a month',
  }))];

  return (
    <div className={`plan-table-wrap ${className}`}>
      <table className="plan-table">
        <caption className="sr-only">Plans compared</caption>
        <thead>
          <tr>
            <th scope="col" className="plan-table-title">{showTitle ? <h2>{title}</h2> : <span className="sr-only">Plan</span>}</th>
            {cols.map((c) => (
              <th key={c.id} scope="col" className={c.id === featured ? 'is-featured' : ''}>
                <span className="plan-table-name">{c.name}</span>
                <span className="plan-table-price">{rupees(c.price)}</span>
                <span className="plan-table-unit">{c.unit}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, free, paid]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {cols.map((c) => {
                const value = c.id === 'free' ? free(total) : paid(c);
                return (
                  <td key={c.id} className={`${c.id === featured ? 'is-featured ' : ''}${NEGATIVE.has(value) ? 'is-off' : ''}`}>{value}</td>
                );
              })}
            </tr>
          ))}
          {action && (
            <tr className="plan-table-actions">
              <th scope="row"><span className="sr-only">Choose</span></th>
              {cols.map((c) => <td key={c.id} className={c.id === featured ? 'is-featured' : ''}>{action(c.id)}</td>)}
            </tr>
          )}
        </tbody>
      </table>

      {/* Phones: one block per plan, same rows (only one of the two layouts is ever displayed) */}
      <div className="plan-stack">
        {showTitle && <h2 className="plan-stack-title">{title}</h2>}
        {cols.map((c) => (
          <section key={c.id} className={`plan-stack-item${c.id === featured ? ' is-featured' : ''}`} aria-label={`${c.name} plan`}>
            <div className="plan-stack-head">
              <span className="plan-table-name">{c.name}</span>
              <span className="plan-table-price">{rupees(c.price)}</span>
              <span className="plan-table-unit">{c.unit}</span>
            </div>
            <dl>
              {ROWS.map(([label, free, paid]) => {
                const value = c.id === 'free' ? free(total) : paid(c);
                return (
                  <div key={label} className={NEGATIVE.has(value) ? 'is-off' : ''}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                );
              })}
            </dl>
            {action && <div className="plan-stack-action">{action(c.id)}</div>}
          </section>
        ))}
      </div>
    </div>
  );
}
