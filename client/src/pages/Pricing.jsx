import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import PlanTable from '../components/PlanTable';
import { api, loadRazorpay } from '../api';
import { useStore } from '../store';

/** Opens Razorpay Checkout for a plan; resolves true once payment is verified by our server. */
export function useCheckout() {
  const { user, setAccount, notify } = useStore();
  const [pending, setPending] = useState(null); // "plan:interval" being bought

  const checkout = async (plan, interval) => {
    setPending(`${plan}:${interval}`);
    try {
      const [Razorpay, order] = await Promise.all([loadRazorpay(), api.subscribe(plan, interval)]);
      return await new Promise((resolve) => {
        const rzp = new Razorpay({
          key: order.keyId,
          subscription_id: order.subscriptionId,
          name: order.name,
          description: order.description,
          prefill: { name: user?.name, email: user?.email },
          theme: { color: '#048afc' },
          handler: async (resp) => {
            try {
              setAccount(await api.verifyPayment(resp));
              notify('Payment successful. Your plan is active!');
              resolve(true);
            } catch (e) {
              notify(`${e.message}. If you were charged, it will activate shortly.`, 'error');
              resolve(false);
            }
          },
          modal: { ondismiss: () => resolve(false) },
        });
        rzp.on('payment.failed', (r) => notify(r.error?.description || 'Payment failed', 'error'));
        rzp.open();
      });
    } catch (e) {
      notify(e.message, 'error');
      return false;
    } finally {
      setPending(null);
    }
  };
  return { checkout, pending };
}

export default function Pricing() {
  const { account, hasPlan } = useStore();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('monthly');
  const { checkout, pending } = useCheckout();
  const current = account?.user?.subscription;
  // Yearly saving from the live prices: "N months free" when every plan matches, else the best % off.
  const yearlyLabel = (() => {
    const ps = (data?.plans || []).filter((p) => p.monthly > 0 && p.yearly > 0);
    if (!ps.length) return null;
    const free = ps.map((p) => 12 - p.yearly / p.monthly);
    if (free.every((f) => f <= 0)) return null;
    const n = Math.round(free[0]);
    if (free.every((f) => Math.abs(f - n) < 0.01) && n > 0) return `${n} month${n === 1 ? '' : 's'} free`;
    return `save up to ${Math.max(...ps.map((p) => Math.floor((1 - p.yearly / (p.monthly * 12)) * 100)))}%`;
  })();

  useEffect(() => {
    api.plans().then(setData).catch(() => setData({ plans: [], configured: false }));
  }, []);

  const choose = async (planId) => {
    if (!account) return navigate(`/signup?next=${encodeURIComponent('/pricing')}`);
    if (await checkout(planId, period)) navigate('/profile/billing');
  };

  return (
    <div className="pricing">
      <section className="pricing-hero">
        <h1>Grow your channel on autopilot</h1>
        <p className="muted">Sign up free and make one trial Short. A plan adds YouTube uploads, autopilot schedules and more styles.</p>
        <div className="segmented billing-toggle" role="tablist">
          <button type="button" className={period === 'monthly' ? 'on' : ''} onClick={() => setPeriod('monthly')}>Monthly</button>
          <button type="button" className={period === 'yearly' ? 'on' : ''} onClick={() => setPeriod('yearly')}>
            Yearly {yearlyLabel && <span className="save">{yearlyLabel}</span>}
          </button>
        </div>
      </section>

      {data && !data.configured && (
        <div className="banner warn">Payments aren't switched on yet. Add Razorpay keys to <code>server/.env</code> to accept subscriptions.</div>
      )}

      {!data ? (
        <div className="empty"><Loader2 className="spin" size={22} /></div>
      ) : (
        <PlanTable
          plans={data.plans}
          period={period}
          title="Compare plans"
          action={(id) => {
            if (id === 'free') {
              if (!account) return <Link to="/signup" className="btn ghost block">Sign up free</Link>;
              return <span className="plan-table-note">{hasPlan ? 'Included with every account' : 'Your current plan'}</span>;
            }
            const p = data.plans.find((x) => x.id === id);
            const isCurrent = hasPlan && current?.plan === id && current?.interval === period;
            const busy = pending === `${id}:${period}`;
            return (
              <button className={`btn ${id === 'pro' ? 'primary' : 'ghost'} block`} disabled={isCurrent || Boolean(pending) || !data.configured}
                onClick={() => choose(id)}>
                {busy && <Loader2 className="spin" size={15} />}
                {isCurrent ? 'Current plan' : hasPlan ? `Switch to ${p.name}` : `Choose ${p.name}`}
              </button>
            );
          }}
        />
      )}
      <p className="hint center">
        Prices in INR, taxes as applicable. Subscriptions renew automatically through Razorpay (UPI, cards, netbanking).
        Cancel anytime; you keep access until the end of the paid period.
      </p>
    </div>
  );
}
