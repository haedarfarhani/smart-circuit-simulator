import { useEffect } from 'react';
import { MenuBar } from '../components/layout/MenuBar';
import { LibrarySidebar } from '../components/layout/LibrarySidebar';
import { Inspector } from '../components/layout/Inspector';
import { StatusBar } from '../components/layout/StatusBar';
import { BottomPanel } from '../components/layout/BottomPanel';
import { CircuitCanvas } from '../components/canvas/CircuitCanvas';
import { AboutDialog } from '../components/dialogs/AboutDialog';
import { TransferDialog } from '../components/dialogs/TransferDialog';
import { useCircuitStore, persistDoc } from '../store/circuitStore';
import { applyLocale, applyTheme, useUiStore } from '../store/uiStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboard';

export function App() {
  const theme = useUiStore((s) => s.theme);
  const locale = useUiStore((s) => s.locale);
  const dialog = useUiStore((s) => s.dialog);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);

  useKeyboardShortcuts();

  // Apply persisted appearance on mount.
  useEffect(() => {
    applyTheme(theme);
    applyLocale(locale);
  }, [theme, locale]);

  // Autosave the document (debounced) whenever it changes.
  useEffect(() => {
    let lastDoc = useCircuitStore.getState().doc;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useCircuitStore.subscribe((state) => {
      if (state.doc === lastDoc) return;
      lastDoc = state.doc;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        persistDoc(useCircuitStore.getState().doc);
        useCircuitStore.getState().markSaved();
      }, 500);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="app">
      <MenuBar />
      <div className="app-main" data-sidebar-collapsed={sidebarCollapsed}>
        <LibrarySidebar />
        <div className="canvas-container">
          <CircuitCanvas />
          <BottomPanel />
        </div>
        <Inspector />
      </div>
      <StatusBar />

      {dialog === 'about' && <AboutDialog />}
      {(dialog === 'transfer-import' || dialog === 'transfer-export') && (
        <TransferDialog mode={dialog === 'transfer-import' ? 'import' : 'export'} />
      )}
    </div>
  );
}
