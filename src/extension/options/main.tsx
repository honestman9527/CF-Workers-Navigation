import { initializeTheme, setupThemeSync } from '@ext/shared/theme';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

import './styles.css';

await initializeTheme();
setupThemeSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
