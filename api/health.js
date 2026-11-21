import { securityHeaders } from '../server/security.mjs';
import { isAuthEnforced } from '../server/auth.mjs';

export default function health(request, response) {
  const headers = securityHeaders({ Allow: 'GET, HEAD' });
  for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  const payload = {
    status: 'ok',
    service: 'asha-sakhi',
    gnaniConfigured: Boolean(process.env.GNANI_API_KEY_ID?.trim()),
    supabaseConfigured: Boolean((process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim()),
    authEnforced: isAuthEnforced(),
    rateLimitStore: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) ? 'kv' : 'memory',
    timestamp: new Date().toISOString(),
  };
  if (request.method === 'HEAD') return response.status(200).end();
  return response.status(200).json(payload);
}
