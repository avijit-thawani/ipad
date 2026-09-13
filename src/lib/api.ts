const TOKEN_KEY = 'ipad.token';
const BASE = '/.netlify/functions';

export class Unauthorized extends Error {}

/**
 * Safari throws on any localStorage access when cookies are blocked or the tab
 * is private, and this one runs during the first render — unguarded it takes
 * the whole app down to a white screen before anything paints.
 */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear if storage was never readable.
  }
}

export async function login(password: string): Promise<void> {
  const response = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error('That password is wrong.');
  const { token } = await response.json();
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    throw new Error('Enable cookies for this site — the session cannot be saved.');
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401) {
    clearToken();
    throw new Unauthorized('Session expired.');
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error ?? 'Something went wrong.');
  }
  return response.json();
}

export type Generated = {
  /** A `data:` URL, ready to drop straight into an `img` src. */
  image: string;
  model: string;
  /** What OpenRouter billed for the call, in USD, when it tells us. */
  cost: number | null;
};

/**
 * Send the canvas and a prompt off to be rendered. Takes 15-20s, which is well
 * inside Netlify's 60s synchronous limit but long enough that the caller must
 * show progress rather than a spinner-free wait.
 */
export function generate(sketch: string, prompt: string): Promise<Generated> {
  return call('/generate', { method: 'POST', body: JSON.stringify({ sketch, prompt }) });
}
