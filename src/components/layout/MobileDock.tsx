import { makeT } from '../../i18n';
import { useSimulationStore } from '../../store/simulationStore';
import { useUiStore } from '../../store/uiStore';

export function MobileDock() {
  const locale = useUiStore((s) => s.locale);
  const t = makeT(locale);
  const overlay = useUiStore((s) => s.overlay);
  const setOverlay = useUiStore((s) => s.setOverlay);
  const setTool = useUiStore((s) => s.setTool);
  const tool = useUiStore((s) => s.tool);
  const bottomOpen = useUiStore((s) => s.bottomPanelOpen);
  const setBottomPanelTab = useUiStore((s) => s.setBottomPanelTab);
  const setBottomPanelOpen = useUiStore((s) => s.setBottomPanelOpen);
  const simOn = useUiStore((s) => s.simulationEnabled);
  const setSim = useUiStore((s) => s.setSimulationEnabled);
  const status = useSimulationStore((s) => s.status);
  const running = simOn && status === 'running';

  return (
    <nav className="mobile-dock" aria-label={t('mobile.nav')}>
      <button
        type="button"
        className="dock-btn"
        data-active={overlay === 'library'}
        onClick={() => setOverlay(overlay === 'library' ? 'none' : 'library')}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z" />
        </svg>
        <span>{t('mobile.library')}</span>
      </button>
      <button
        type="button"
        className="dock-btn"
        data-active={tool === 'wire'}
        onClick={() => setTool(tool === 'wire' ? 'select' : 'wire')}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M2 13h4l4-10h4" strokeLinecap="round" />
        </svg>
        <span>{t('tool.wire')}</span>
      </button>
      <button
        type="button"
        className="dock-btn dock-run"
        data-active={running}
        onClick={() => setSim(!simOn)}
        aria-pressed={simOn}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          {running ? (
            <path d="M4.5 3.5A.5.5 0 0 1 5 4v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm7 0a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z" />
          ) : (
            <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z" />
          )}
        </svg>
        <span>{running ? t('sim.pause') : t('sim.run')}</span>
      </button>
      <button
        type="button"
        className="dock-btn"
        data-active={overlay === 'inspector'}
        onClick={() => setOverlay(overlay === 'inspector' ? 'none' : 'inspector')}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z" />
        </svg>
        <span>{t('mobile.properties')}</span>
      </button>
      <button
        type="button"
        className="dock-btn"
        data-active={bottomOpen}
        onClick={() => {
          setBottomPanelTab('oscilloscope');
          setBottomPanelOpen(!bottomOpen);
        }}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
          <path d="M3.5 10l2.5-4 2 4 2.5-4 2 4" strokeLinecap="round" />
        </svg>
        <span>{t('tab.oscilloscope')}</span>
      </button>
    </nav>
  );
}
