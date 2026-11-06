import { useUiStore } from '../../store/uiStore';
import { useCircuitStore } from '../../store/circuitStore';
import { useProbeStore } from '../../store/probeStore';
import { makeT } from '../../i18n';

export function CanvasHud() {
  const ui = useUiStore();
  const t = makeT(ui.locale);
  const store = useCircuitStore();
  const probe = useProbeStore();
  const placement = probe.placement;

  // Touch devices get "tap" phrasing instead of "click".
  const coarse =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  const placementPrompt =
    placement.mode === 'voltage'
      ? placement.step === 1
        ? t(coarse ? 'probe.tapVoltage1' : 'probe.placeVoltage1')
        : t(coarse ? 'probe.tapVoltage2' : 'probe.placeVoltage2')
      : placement.mode === 'current'
        ? t(coarse ? 'probe.tapCurrent' : 'probe.placeCurrent')
        : null;

  const zoomPct = Math.round(ui.zoom * 100);

  const handleZoomIn = () => {
    ui.setView({ zoom: ui.zoom * 1.25 });
  };

  const handleZoomOut = () => {
    ui.setView({ zoom: ui.zoom * 0.8 });
  };

  const handleResetZoom = () => {
    ui.setView({ zoom: 1, panX: 0, panY: 0 });
  };

  const handleCenter = () => {
    const comps = store.doc.components;
    if (comps.length === 0) {
      ui.setView({ zoom: 1, panX: 0, panY: 0 });
      return;
    }
    const canvasEl = document.querySelector('.canvas-wrap');
    const rect = canvasEl?.getBoundingClientRect();
    const w = rect ? rect.width : window.innerWidth;
    const h = rect ? rect.height : window.innerHeight;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of comps) {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    }
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    ui.setView({
      panX: w / 2 - midX * ui.zoom,
      panY: h / 2 - midY * ui.zoom,
    });
  };

  const toggleProbe = (kind: 'voltage' | 'current') => {
    // Clicking the active tool again cancels it — much less frustrating.
    if (placement.mode === kind) probe.cancelPlacement();
    else probe.startPlacement(kind);
  };

  const hudVisible = useUiStore((s) => s.hudVisible);
  const setHudVisible = useUiStore((s) => s.setHudVisible);

  // The pill and its restore button stay mounted in the same grid cell so
  // hide/show cross-fades with a slide instead of popping in and out.
  const pillHidden = !hudVisible && !placementPrompt;

  return (
    <div className="canvas-hud">
      {placementPrompt && (
        <div className="hud-prompt" role="status">
          <span className="hud-probe-dot" data-mode={placement.mode} />
          <span className="hud-prompt-text">{placementPrompt}</span>
          <button
            type="button"
            className="hud-probe-cancel"
            onClick={() => probe.cancelPlacement()}
            aria-label={t('probe.cancel')}
            title={t('probe.cancel')}
          >
            ×
          </button>
        </div>
      )}

      <div className="hud-stack">
        <div
          className="hud-pill"
          data-hidden={pillHidden}
          role="toolbar"
          aria-label="Canvas HUD"
          aria-hidden={pillHidden}
        >
        <div className="hud-group" role="group" aria-label={t('hud.zoomIn')}>
          <button
            type="button"
            className="hud-btn"
            title={`${t('hud.zoomOut')} (Ctrl+-)`}
            aria-label={t('hud.zoomOut')}
            onClick={handleZoomOut}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 8a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 8Z" />
            </svg>
          </button>

          <button
            type="button"
            className="hud-zoom-badge"
            title={t('hud.resetZoom')}
            aria-label={t('hud.resetZoom')}
            onClick={handleResetZoom}
          >
            {zoomPct}%
          </button>

          <button
            type="button"
            className="hud-btn"
            title={`${t('hud.zoomIn')} (Ctrl++)`}
            aria-label={t('hud.zoomIn')}
            onClick={handleZoomIn}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3a.75.75 0 0 1 .75-.75v3.5h3.5a.75.75 0 0 1 0 1.5h-3.5v3.5a.75.75 0 0 1-1.5 0v-3.5H3.75a.75.75 0 0 1 0-1.5h3.5V3.75A.75.75 0 0 1 8 3Z" />
            </svg>
          </button>
        </div>

        <div className="hud-sep" aria-hidden="true" />

        <div className="hud-group" role="group" aria-label="view">
          <button
            type="button"
            className="hud-btn"
            title={t('hud.center')}
            aria-label={t('hud.center')}
            onClick={handleCenter}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="5" />
              <path d="M8 1v3M8 12v3M1 8h3M12 8h3" strokeLinecap="round" />
            </svg>
          </button>

          <button
            type="button"
            className="hud-btn"
            data-active={ui.gridVisible}
            title={t('hud.grid')}
            aria-label={t('hud.grid')}
            aria-pressed={ui.gridVisible}
            onClick={() => ui.setGridVisible(!ui.gridVisible)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="3" cy="3" r="1.3" />
              <circle cx="8" cy="3" r="1.3" />
              <circle cx="13" cy="3" r="1.3" />
              <circle cx="3" cy="8" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="13" cy="8" r="1.3" />
              <circle cx="3" cy="13" r="1.3" />
              <circle cx="8" cy="13" r="1.3" />
              <circle cx="13" cy="13" r="1.3" />
            </svg>
          </button>

          <button
            type="button"
            className="hud-btn"
            data-active={ui.snapEnabled}
            title={t('hud.snap')}
            aria-label={t('hud.snap')}
            aria-pressed={ui.snapEnabled}
            onClick={() => ui.setSnapEnabled(!ui.snapEnabled)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 3v5a4 4 0 0 0 8 0V3" />
              <path d="M2.5 3h3M10.5 3h3" />
            </svg>
          </button>
        </div>

        <div className="hud-sep" aria-hidden="true" />

        <div className="hud-group" role="group" aria-label={t('features.oscilloscope')}>
          <button
            type="button"
            className="hud-btn hud-probe-btn hud-scope-btn"
            data-active={ui.scopeFloatingOpen}
            aria-pressed={ui.scopeFloatingOpen}
            title={t('features.oscilloscope')}
            aria-label={t('features.oscilloscope')}
            onClick={() => {
              if (ui.scopeFloatingOpen && ui.scopeFloatingMinimized) {
                ui.setScopeFloatingMinimized(false);
              } else {
                ui.setScopeFloatingOpen(!ui.scopeFloatingOpen);
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
              <path d="M3.5 10l2.5-4 2 4 2.5-4 2 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hud-probe-text">{t('tab.oscilloscope')}</span>
          </button>
        </div>

        <div className="hud-sep" aria-hidden="true" />

        <div className="hud-group" role="group" aria-label="probes">
          <button
            type="button"
            className="hud-btn hud-probe-btn"
            data-active={placement.mode === 'voltage'}
            aria-pressed={placement.mode === 'voltage'}
            title={t('probe.voltageProbe')}
            aria-label={t('probe.voltageProbe')}
            onClick={() => toggleProbe('voltage')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2v9" strokeLinecap="round" />
              <path d="M5.5 11.5a2.5 2.5 0 1 0 5 0" />
              <path d="M8 4.5 10.5 2M8 4.5 5.5 2" strokeLinecap="round" />
            </svg>
            <span className="hud-probe-text">{t('probe.voltage')}</span>
          </button>

          <button
            type="button"
            className="hud-btn hud-probe-btn"
            data-active={placement.mode === 'current'}
            aria-pressed={placement.mode === 'current'}
            title={t('probe.currentProbe')}
            aria-label={t('probe.currentProbe')}
            onClick={() => toggleProbe('current')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="5.5" />
              <path d="M8 8 11.5 4.5" strokeLinecap="round" />
              <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            <span className="hud-probe-text">{t('probe.current')}</span>
          </button>
        </div>

        <div className="hud-sep" aria-hidden="true" />

        <div className="hud-group" role="group" aria-label="flow">
          <button
            type="button"
            className="hud-btn hud-flow-btn"
            data-active={ui.currentDirection === 'electron'}
            aria-pressed={ui.currentDirection === 'electron'}
            title={`${t('hud.flowDirection')}: ${ui.currentDirection === 'conventional' ? t('hud.flowConventional') : t('hud.flowElectron')}`}
            aria-label={t('hud.flowDirection')}
            onClick={() => ui.setCurrentDirection(ui.currentDirection === 'conventional' ? 'electron' : 'conventional')}
          >
            <span className="flow-badge-text">
              {ui.currentDirection === 'conventional' ? 'I+' : 'e⁻'}
            </span>
          </button>
        </div>

        <div className="hud-sep" aria-hidden="true" />

        <div className="hud-group" role="group" aria-label="history">
          <button
            type="button"
            className="hud-btn"
            disabled={store.past.length === 0}
            title={`${t('hud.undo')} (Ctrl+Z)`}
            aria-label={t('hud.undo')}
            onClick={() => store.undo()}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6.5h7a3.5 3.5 0 0 1 0 7H9" />
              <path d="m6.5 4-2.5 2.5 2.5 2.5" />
            </svg>
          </button>

          <button
            type="button"
            className="hud-btn"
            disabled={store.future.length === 0}
            title={`${t('hud.redo')} (Ctrl+Shift+Z)`}
            aria-label={t('hud.redo')}
            onClick={() => store.redo()}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 6.5H5a3.5 3.5 0 0 0 0 7h2" />
              <path d="m9.5 4 2.5 2.5-2.5 2.5" />
            </svg>
          </button>
        </div>

        <div className="hud-sep" aria-hidden="true" />

        <div className="hud-group" role="group" aria-label={t('hud.hideToolbar')}>
          <button
            type="button"
            className="hud-btn"
            title={t('hud.hideToolbar')}
            aria-label={t('hud.hideToolbar')}
            aria-pressed={false}
            tabIndex={pillHidden ? -1 : 0}
            onClick={() => setHudVisible(false)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m3.5 6.5 4.5 4.5 4.5-4.5" />
              <path d="M3.5 3h9" />
            </svg>
          </button>
        </div>
      </div>

        <button
          type="button"
          className="hud-restore"
          data-hidden={hudVisible}
          title={t('hud.showToolbar')}
          aria-label={t('hud.showToolbar')}
          aria-pressed={false}
          tabIndex={hudVisible ? -1 : 0}
          onClick={() => setHudVisible(true)}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m3.5 9.5 4.5-4.5 4.5 4.5" />
            <path d="M3.5 13h9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
