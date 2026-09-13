import { Suspense, lazy, useState } from 'react';
import LoginPage from './pages/LoginPage';
import ErrorBoundary from './ErrorBoundary';
import { getToken } from './lib/api';

/**
 * Lazy so that tldraw — which is the overwhelming majority of the bundle — is
 * neither downloaded nor evaluated until you are past the password. Imported
 * statically it had to evaluate before the login screen could paint, which
 * meant anything tldraw dislikes about a given Safari showed up as a blank
 * white page with no way to tell what had failed.
 */
const DrawPage = lazy(() => import('./pages/DrawPage'));

export default function App() {
  const [authed, setAuthed] = useState(() => Boolean(getToken()));

  if (!authed) return <LoginPage onSuccess={() => setAuthed(true)} />;

  // No router: there is one screen. A 401 from any call drops the token, and
  // this remounts the gate.
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center text-base-content/40">
            Loading the canvas…
          </div>
        }
      >
        <DrawPage onSignedOut={() => setAuthed(false)} />
      </Suspense>
    </ErrorBoundary>
  );
}
