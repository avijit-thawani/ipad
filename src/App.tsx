import { useState } from 'react';
import LoginPage from './pages/LoginPage';
import DrawPage from './pages/DrawPage';
import { getToken } from './lib/api';

export default function App() {
  const [authed, setAuthed] = useState(() => Boolean(getToken()));

  if (!authed) return <LoginPage onSuccess={() => setAuthed(true)} />;

  // No router: there is one screen. A 401 from any call drops the token, and
  // this remounts the gate.
  return <DrawPage onSignedOut={() => setAuthed(false)} />;
}
