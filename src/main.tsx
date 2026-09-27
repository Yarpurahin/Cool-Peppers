import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import { App } from './app/App.tsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/responsive.css';
import './styles/info-pages.css';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
if (root.dataset.prerendered === 'true') hydrateRoot(root, app);
else createRoot(root).render(app);

import './features/negotiation/ui/negotiation.css';
