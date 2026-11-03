import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MEDIA_DIR = path.join(ROOT, 'media');

export const config = {
  port: Number(process.env.PORT || 5001),
  // 127.0.0.1 in production so only the HTTPS proxy (Caddy) can reach the app; all interfaces locally.
  host: process.env.HOST || undefined,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/stick-reels',
  // Where OAuth redirects back to. Empty = same origin as the API (built client served by Express).
  clientUrl: process.env.CLIENT_URL || '',
  uvBin: process.env.UV_BIN || 'uv',
  // Session cookies get the Secure flag when the site is served over HTTPS.
  secureCookies: process.env.SECURE_COOKIES === 'true',
  // Proxies in front of the app (Caddy, plus Vercel when the frontend proxies /api). Used for client IPs.
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 1),
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    // Leave empty to build it from the address the user is on (e.g. https://<app>.vercel.app/api/youtube/callback).
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  },
};
