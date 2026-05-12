import { useEffect, useState } from 'react';
import AudioEngine from './components/AudioEngine';
import { handleOAuthCallback } from './lib/tone3000/client';
import styles from './App.module.css';

export default function App() {
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const state  = params.get('state');
    if (!code || !state) return;

    window.history.replaceState({}, '', window.location.pathname);

    handleOAuthCallback(code, state)
      .then(() => window.dispatchEvent(new Event('tone3000-authed')))
      .catch((e) => setAuthError(e instanceof Error ? e.message : 'Login failed'));
  }, []);

  return (
    <div className={styles.app}>
      {authError && (
        <p style={{ color: '#e53935', fontSize: 12, padding: '8px 20px', margin: 0 }}>
          tone3000 login failed: {authError}
        </p>
      )}
      <AudioEngine />
    </div>
  );
}
