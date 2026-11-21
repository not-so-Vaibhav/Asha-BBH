import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwksCache = new Map();

function getSupabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
}

function getJwtSecret() {
  return (process.env.SUPABASE_JWT_SECRET || '').trim();
}

export function isAuthEnforced() {
  if (process.env.REQUIRE_AUTH === 'false') return false;
  if (process.env.REQUIRE_AUTH === 'true') return true;
  return Boolean(getSupabaseUrl() || getJwtSecret());
}

function extractBearerToken(request) {
  const auth = request.headers?.authorization || request.headers?.Authorization;
  if (typeof auth === 'string') {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  // Support WebSocket query token or Sec-WebSocket-Protocol bearer token
  try {
    const url = new URL(request.url || '/', 'http://localhost');
    const queryToken = url.searchParams.get('access_token');
    if (queryToken && queryToken.trim()) return queryToken.trim();
  } catch {
    // ignore malformed URL
  }
  const wsProto = request.headers?.['sec-websocket-protocol'];
  if (typeof wsProto === 'string') {
    for (const part of wsProto.split(',').map((s) => s.trim())) {
      if (part.startsWith('bearer.')) return part.slice('bearer.'.length);
    }
  }
  return null;
}

function payloadToIdentity(payload) {
  const userId = typeof payload?.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : null;
  if (!userId) return null;
  return {
    userId,
    role: typeof payload.role === 'string' ? payload.role : 'authenticated',
    email: typeof payload.email === 'string' ? payload.email : null,
    isAnonymous: Boolean(payload.is_anonymous),
  };
}

/**
 * Verifies a Supabase JWT from Authorization: Bearer <token> or WebSocket ?access_token=<token>.
 * Supports:
 * 1. HS256 verification via SUPABASE_JWT_SECRET
 * 2. Asymmetric JWKS verification via ${SUPABASE_URL}/auth/v1/.well-known/jwks.json
 * 3. Fallback verification via Supabase Auth /auth/v1/user (using anon key + caller's JWT)
 */
export async function verifySupabaseRequest(request, { fetchImpl = fetch, customVerifier = null } = {}) {
  if (!isAuthEnforced()) {
    return { ok: true, enforced: false, user: { userId: 'local-preview', role: 'authenticated', email: null, isAnonymous: true } };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Sign in or start a demo session to use Gnani voice services.' };
  }

  if (customVerifier) {
    try {
      const verified = await customVerifier(token);
      if (verified?.userId) return { ok: true, enforced: true, user: verified };
      return { ok: false, status: 401, code: 'INVALID_TOKEN', error: 'Your session is invalid or expired. Please sign in again.' };
    } catch {
      return { ok: false, status: 401, code: 'INVALID_TOKEN', error: 'Your session is invalid or expired. Please sign in again.' };
    }
  }

  const secret = getJwtSecret();
  const supabaseUrl = getSupabaseUrl();

  if (secret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
        algorithms: ['HS256'],
      });
      const user = payloadToIdentity(payload);
      if (user) return { ok: true, enforced: true, user };
    } catch {
      // Fall through to JWKS if project uses asymmetric signing keys
    }
  }

  if (supabaseUrl) {
    try {
      let jwks = jwksCache.get(supabaseUrl);
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
        jwksCache.set(supabaseUrl, jwks);
      }
      const { payload } = await jwtVerify(token, jwks, {
        issuer: `${supabaseUrl}/auth/v1`,
      });
      const user = payloadToIdentity(payload);
      if (user) return { ok: true, enforced: true, user };
    } catch {
      // Fallback to /auth/v1/user when anon key is present (handles rotated or HS256 hosted keys without JWT secret)
      const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
      if (anonKey) {
        try {
          const res = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: anonKey,
            },
            signal: AbortSignal.timeout(4_000),
          });
          if (res.ok) {
            const data = await res.json();
            if (typeof data?.id === 'string' && data.id) {
              return {
                ok: true,
                enforced: true,
                user: {
                  userId: data.id,
                  role: data.role || 'authenticated',
                  email: data.email || null,
                  isAnonymous: Boolean(data.is_anonymous),
                },
              };
            }
          }
        } catch {
          // Reject below
        }
      }
    }
  }

  if (!secret && !supabaseUrl) {
    return {
      ok: false,
      status: 503,
      code: 'AUTH_NOT_CONFIGURED',
      error: 'Authentication verifier is not configured on the server.',
    };
  }

  return { ok: false, status: 401, code: 'INVALID_TOKEN', error: 'Your session is invalid or expired. Please sign in again.' };
}
