import { useEffect } from 'react';
import { applyTheme, useUiStore, type Breakpoint } from '../store/uiStore';

function fromWidth(w: number): Breakpoint {
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  if (w < 1440) return 'desktop';
  return 'wide';
}

export function useBreakpoint(): void {
  useEffect(() => {
    const apply = () => {
      useUiStore.getState().setBreakpoint(fromWidth(window.innerWidth));
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
}

export function useSystemThemeSync(): void {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      if (useUiStore.getState().theme === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
}
