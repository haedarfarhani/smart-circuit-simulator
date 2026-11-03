import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/global.css';
import { applyLocale, applyTheme, applyVizColors, useUiStore } from './store/uiStore';

// Apply persisted appearance before the first render.
const initial = useUiStore.getState();
applyTheme(initial.theme);
applyLocale(initial.locale);
applyVizColors(initial.vizColors);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
