import { checkPassword, issueToken, json } from '../lib/auth';

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let password: unknown;
  try {
    password = ((await request.json()) as { password?: unknown }).password;
  } catch {
    return json({ error: 'invalid body' }, 400);
  }

  if (!checkPassword(password)) {
    // Slow down brute force a little without keeping any state.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return json({ error: 'wrong password' }, 401);
  }

  return json({ token: issueToken() });
};
