import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';
import { applyLocale, applyTheme, useUiStore } from './store/uiStore';

// Apply persisted appearance before the first render.
const initial = useUiStore.getState();
applyTheme(initial.theme);
applyLocale(initial.locale);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
