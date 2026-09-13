import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.APP_SECRET;
  if (!value) throw new Error('APP_SECRET is not set');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function issueToken(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS })).toString(
    'base64url'
  );
  return `${payload}.${sign(payload)}`;
}

export function checkPassword(candidate: unknown): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error('APP_PASSWORD is not set');
  if (typeof candidate !== 'string') return false;

  // Compare hashes so the comparison is constant time regardless of length.
  const a = createHmac('sha256', secret()).update(candidate).digest();
  const b = createHmac('sha256', secret()).update(expected).digest();
  return timingSafeEqual(a, b);
}

function isValidToken(token: string): boolean {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

/**
 * Returns null when the caller is authorised, or a 401 Response to return as-is.
 * Every function except `login` must start with this.
 */
export function requireAuth(request: Request): Response | null {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !isValidToken(token)) {
    return json({ error: 'unauthorized' }, 401);
  }
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
