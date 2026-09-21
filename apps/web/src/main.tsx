import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { User } from 'oidc-client-ts';

import { getCurrentUser, userManager } from './auth';

function App() {
  const [subject, setSubject] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<string | null>(null);

  const verifyApiAccess = async (user: User) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/me`, {
      headers: { authorization: `Bearer ${user.access_token}` },
    });

    if (!response.ok) {
      setApiResult(`API verification failed: ${response.status}`);
      return;
    }

    const body = (await response.json()) as { sub: string };
    setApiResult(`API verified token for: ${body.sub}`);
  };

  useEffect(() => {
    if (window.location.pathname === '/auth/callback') {
      void userManager.signinRedirectCallback().then((user) => {
        window.history.replaceState({}, document.title, '/');
        setSubject(user.profile.sub);
        void verifyApiAccess(user);
      });
      return;
    }

    void getCurrentUser().then((user) => {
      setSubject(user?.profile.sub ?? null);
      if (user) {
        void verifyApiAccess(user);
      }
    });
  }, []);

  if (!subject) {
    return (
      <main>
        <h1>AuthN / AuthZ Learning</h1>
        <button onClick={() => void userManager.signinRedirect()}>Zitadel でログイン</button>
      </main>
    );
  }

  return (
    <main>
      <h1>AuthN / AuthZ Learning</h1>
      <p>ログイン済み: {subject}</p>
      <p>{apiResult ?? 'API トークン検証中...'}</p>
      <button onClick={() => void userManager.signoutRedirect()}>ログアウト</button>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
