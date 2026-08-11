import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registering a service worker is what lets phones offer "add to home screen".
// It caches nothing, so it can never serve a stale build mid-game.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/';
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      /* unsupported or blocked — the app behaves exactly the same without it */
    });
  });
}
