const TOKEN_KEY = 'ipad.token';
const BASE = '/.netlify/functions';

export class Unauthorized extends Error {}

/**
 * Parse a response body as JSON, and when it is not JSON say what actually
 * arrived. A bare "unexpected token" from the browser names neither the
 * endpoint nor the status nor who answered, which on a device with no console
 * is close to useless — the body itself is what identifies the culprit, since
 * an HTML shell means the proxy missed and a JSON error means it did not.
 */
async function parseJson(response: Response, endpoint: string): Promise<unknown> {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    const type = response.headers.get('content-type') ?? 'no content-type';
    throw new Error(
      `${endpoint} returned ${response.status} (${type}) that is not JSON.\n\n` +
        `First 300 characters of the body:\n${body.slice(0, 300)}`
    );
  }
}

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
  let response: Response;
  try {
    response = await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  } catch {
    throw new Error('Could not reach the server. Is the dev server still running?');
  }

  // Only a 401 means the password was actually checked and rejected. Reporting
  // every failure as a wrong password sent me hunting through a clean .env
  // while the real problem was that the functions server had died and the Vite
  // proxy was answering 502.
  if (response.status === 401) throw new Error('That password is wrong.');
  if (!response.ok) {
    throw new Error(
      response.status === 502
        ? 'The functions server is not running — start `netlify functions:serve`.'
        : `The server returned ${response.status}.`
    );
  }
  const payload = (await parseJson(response, 'login')) as { token?: unknown };
  if (typeof payload.token !== 'string' || !payload.token) {
    throw new Error(`login returned no token: ${JSON.stringify(payload).slice(0, 300)}`);
  }

  try {
    localStorage.setItem(TOKEN_KEY, payload.token);
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

  const endpoint = path.split('?')[0].replace(/^\//, '');
  const payload = (await parseJson(response, endpoint)) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `${endpoint} returned ${response.status}.`);
  }
  return payload as T;
}

export type Generated = {
  /** A `data:` URL, ready to drop straight into an `img` src. */
  image: string;
  model: string;
  /** What OpenRouter billed for the call, in USD, when it tells us. */
  cost: number | null;
  /**
   * Wall-clock time for the round trip. Measured here because OpenRouter
   * publishes no latency figure for image models — the endpoint records carry
   * pricing only — so the only honest numbers are the ones we observe.
   */
  elapsedMs: number;
};

export type GenerateOptions = {
  prompt: string;
  model: string;
  style: string;
  effort: number;
  aspect: string;
  /** 1 (interpret) to 5 (literal), how closely the render follows the drawing. */
  adherence: number;
};

/**
 * Send the canvas and a prompt off to be rendered. Takes 15-20s, which is well
 * inside Netlify's 60s synchronous limit but long enough that the caller must
 * show progress rather than a spinner-free wait.
 */
export async function generate(sketch: string, options: GenerateOptions): Promise<Generated> {
  const started = Date.now();
  const result = await call<Omit<Generated, 'elapsedMs'>>('/generate', {
    method: 'POST',
    body: JSON.stringify({ sketch, ...options }),
  });
  return { ...result, elapsedMs: Date.now() - started };
}
