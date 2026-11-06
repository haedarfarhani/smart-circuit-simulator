import { useEffect, type CSSProperties } from 'react';
import { MenuBar } from '../components/layout/MenuBar';
import { LibrarySidebar } from '../components/layout/LibrarySidebar';
import { Inspector } from '../components/layout/Inspector';
import { StatusBar } from '../components/layout/StatusBar';
import { BottomPanel } from '../components/layout/BottomPanel';
import { MobileDock } from '../components/layout/MobileDock';
import { ColorLegend } from '../components/layout/ColorLegend';
import { Onboarding } from '../components/layout/Onboarding';
import { ToastStack } from '../components/layout/ToastStack';
import { CircuitCanvas } from '../components/canvas/CircuitCanvas';
import { AboutDialog } from '../components/dialogs/AboutDialog';
import { TransferDialog } from '../components/dialogs/TransferDialog';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { ConfirmNewDialog } from '../components/dialogs/ConfirmNewDialog';
import { FloatingOscilloscope } from '../components/panels/FloatingOscilloscope';
import { useCircuitStore, persistDoc } from '../store/circuitStore';
import { applyLocale, applyTheme, useUiStore } from '../store/uiStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboard';
import { useBreakpoint, useSystemThemeSync } from '../hooks/useBreakpoint';

export function App() {
  const theme = useUiStore((s) => s.theme);
  const locale = useUiStore((s) => s.locale);
  const dialog = useUiStore((s) => s.dialog);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const inspectorCollapsed = useUiStore((s) => s.inspectorCollapsed);
  const inspectorWidth = useUiStore((s) => s.inspectorWidth);
  const overlay = useUiStore((s) => s.overlay);
  const breakpoint = useUiStore((s) => s.breakpoint);
  const scopeFullscreen = useUiStore((s) => s.scopeFullscreen);

  useKeyboardShortcuts();
  useBreakpoint();
  useSystemThemeSync();

  useEffect(() => {
    applyTheme(theme);
    applyLocale(locale);
  }, [theme, locale]);

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

  const compact = breakpoint === 'tablet' || breakpoint === 'mobile';

  return (
    <div
      className="app"
      data-sidebar-collapsed={sidebarCollapsed}
      data-inspector-collapsed={inspectorCollapsed || compact}
      data-bp={breakpoint}
      data-overlay={overlay}
      data-scope-full={scopeFullscreen}
    >
      <MenuBar />
      <div
        className="app-main"
        style={
          compact || inspectorCollapsed
            ? undefined
            : ({ '--insp-w': `${inspectorWidth}px` } as CSSProperties)
        }
      >
        <LibrarySidebar />
        <div className="canvas-container">
          <CircuitCanvas />
          <ColorLegend />
          <BottomPanel />
          <FloatingOscilloscope />
        </div>
        <Inspector />
      </div>
      {compact && overlay !== 'none' && (
        <button
          type="button"
          className="sheet-backdrop"
          aria-label="Close panel"
          onClick={() => useUiStore.getState().setOverlay('none')}
        />
      )}
      <StatusBar />
      <MobileDock />
      <ToastStack />

      <Onboarding />
      {dialog === 'about' && <AboutDialog />}
      {dialog === 'confirm-new' && <ConfirmNewDialog />}
      {dialog === 'settings' && <SettingsDialog />}
      {(dialog === 'transfer-import' || dialog === 'transfer-export') && (
        <TransferDialog mode={dialog === 'transfer-import' ? 'import' : 'export'} />
      )}
    </div>
  );
}
