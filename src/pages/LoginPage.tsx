import { useState } from 'react';
import { login } from '../lib/api';

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(password);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="h-full flex items-center justify-center px-6 safe-top safe-bottom">
      <form
        onSubmit={submit}
        className="w-full max-w-sm flex flex-col gap-7 animate-pop-in"
      >
        <div>
          <h1 className="text-5xl font-semibold tracking-tight">Sketch</h1>
          <p className="text-base-content/55 mt-3 leading-relaxed">
            Draw badly. Ask for something better.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full rounded-box bg-base-100 border-2 border-base-content/15
                       focus:border-primary/60 focus:outline-none px-4 py-3.5 text-lg
                       placeholder:text-base-content/35 transition-colors"
          />
          <button
            type="submit"
            disabled={!password || busy}
            className="btn btn-chunky btn-primary btn-lg btn-block rounded-field font-semibold"
          >
            {busy ? 'Checking…' : 'Enter'}
          </button>
          <p className="text-error text-sm min-h-5">{error}</p>
        </div>
      </form>
    </main>
  );
}
