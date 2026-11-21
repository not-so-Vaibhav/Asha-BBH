/// <reference types="vite/client" />
import React from 'react';
import { createRoot } from 'react-dom/client';
import RootApp from './RootApp';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
);

const splash = document.getElementById('splash');
if (splash) {
  splash.style.opacity = '0';
  setTimeout(() => splash.remove(), 220);
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
