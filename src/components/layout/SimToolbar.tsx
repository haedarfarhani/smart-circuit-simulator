import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../../store/uiStore';
import { SIM_SPEED_PRESETS, simSpeedLabel, useSimulationStore } from '../../store/simulationStore';
import { makeT } from '../../i18n';

/**
 * Simulation + tools controls, floating above the canvas HUD as their own
 * pill. The open/close button lives ON the toolbar (chevron at its end);
 * when collapsed a small restore button stays in the same spot. The pill
 * mirrors the canvas HUD styling and both cross-fade with a slide.
 */
export function SimToolbar() {
  const locale = useUiStore((s) => s.locale);
  const t = makeT(locale);
  const expanded = useUiStore((s) => s.simToolbarExpanded);
  const toggleExpanded = useUiStore((s) => s.toggleSimToolbar);
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);

  return (
    <div className="sim-toolbar">
      <div
        className="sim-toolbar-pill"
        data-hidden={!expanded}
        role="toolbar"
        aria-label={t('simToolbar.label')}
        aria-hidden={!expanded}
      >
        <div className="workbench-tools">
          <button
            className="mode-tool-btn"
            data-active={tool === 'select'}
            onClick={() => setTool('select')}
            title={`${t('tool.select')} (V)`}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 2l10 6-4.5 1.2L11 14l-2 .8-2.4-4.6L3 12.5z" />
            </svg>
            <span className="mode-label">{t('tool.select')}</span>
          </button>

          <button
            className="mode-tool-btn"
            data-active={tool === 'wire'}
            onClick={() => setTool('wire')}
            title={`${t('tool.wire')} (W)`}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 13h4l4-10h4" strokeLinecap="round" />
              <circle cx="2" cy="13" r="1.5" fill="currentColor" />
              <circle cx="14" cy="3" r="1.5" fill="currentColor" />
            </svg>
            <span className="mode-label">{t('tool.wire')}</span>
          </button>

          <button
            className="mode-tool-btn"
            data-active={tool === 'hand'}
            onClick={() => setTool('hand')}
            title={`${t('tool.hand')} (H)`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
              <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
              <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
            <span className="mode-label">{t('tool.hand')}</span>
          </button>
        </div>

        <div className="hud-sep" aria-hidden="true" />

        <HeaderSimulationControls openUpward />

        <div className="hud-sep" aria-hidden="true" />

        <button
          type="button"
          className="hud-btn"
          title={t('simToolbar.hide')}
          aria-label={t('simToolbar.hide')}
          aria-pressed={false}
          tabIndex={expanded ? 0 : -1}
          onClick={toggleExpanded}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m3.5 6.5 4.5 4.5 4.5-4.5" />
            <path d="M3.5 3h9" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        className="hud-restore sim-restore"
        data-hidden={expanded}
        title={t('simToolbar.show')}
        aria-label={t('simToolbar.show')}
        aria-pressed={false}
        tabIndex={expanded ? -1 : 0}
        onClick={toggleExpanded}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M2 4.5h6.5M12.5 4.5H14M2 11.5h1.5M7.5 11.5H14" />
          <circle cx="10.5" cy="4.5" r="2" />
          <circle cx="5.5" cy="11.5" r="2" />
        </svg>
      </button>
    </div>
  );
}

/** Fixed anchor for the speed popover; `bottom` opens it upwards. */
interface SpeedAnchor {
  top?: number;
  bottom?: number;
  start: number;
}

function HeaderSimulationControls({ openUpward = false }: { openUpward?: boolean }) {
  const ui = useUiStore();
  const t = makeT(ui.locale);
  const simulationStatus = useSimulationStore((s) => s.status);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [speedAnchor, setSpeedAnchor] = useState<SpeedAnchor | null>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const speedTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!speedMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (speedRef.current && !speedRef.current.contains(e.target as Node)) {
        setSpeedMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [speedMenuOpen]);

  /** The menu is position:fixed so no ancestor can clip it. Near the bottom
      of the screen it opens upwards instead of falling off the viewport. */
  const toggleSpeedMenu = () => {
    if (!speedMenuOpen && speedTriggerRef.current) {
      const r = speedTriggerRef.current.getBoundingClientRect();
      const rtl = document.documentElement.dir === 'rtl';
      const start = Math.max(
        8,
        Math.min(rtl ? window.innerWidth - r.right : r.left, window.innerWidth - 178),
      );
      setSpeedAnchor(
        openUpward
          ? { bottom: window.innerHeight - r.top + 8, start }
          : { top: r.bottom + 8, start },
      );
    }
    setSpeedMenuOpen(!speedMenuOpen);
  };

  // State label doubles as the accessible name: on phones the visible text is
  // hidden (icon-only pill), so the button still announces its state.
  const simStateLabel = ui.simulationEnabled
    ? simulationStatus === 'running'
      ? t('sim.running')
      : t('sim.paused')
    : t('sim.off');

  return (
    <div className="sim-header-group">
      <button
        type="button"
        className={`sim-power-pill ${ui.simulationEnabled ? 'is-running' : 'is-stopped'}`}
        data-running={simulationStatus === 'running'}
        onClick={() => ui.setSimulationEnabled(!ui.simulationEnabled)}
        aria-pressed={ui.simulationEnabled}
        aria-label={simStateLabel}
        title={ui.simulationEnabled ? t('sim.disable') : t('sim.enable')}
      >
        <span className="power-indicator-ring">
          <span className="power-indicator-dot" />
        </span>
        <svg
          className="sim-power-icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          {ui.simulationEnabled ? (
            <path d="M4.5 3.5A.5.5 0 0 1 5 4v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm7 0a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z" />
          ) : (
            <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z" />
          )}
        </svg>
        <span className="sim-power-text">{simStateLabel}</span>
      </button>

      {/* Speed Controller Popover */}
      <div className="sim-speed-popover-wrap" ref={speedRef}>
        <button
          type="button"
          className="sim-speed-trigger"
          title={t('sim.speed')}
          ref={speedTriggerRef}
          onClick={toggleSpeedMenu}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="m11.5 8 .5-.5a3.5 3.5 0 1 0-7 0l.5.5a2.5 2.5 0 1 1 6 0z" />
            <path d="M8 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
          </svg>
          <span>{ui.simulationSpeed.toFixed(1)}x</span>
        </button>

        {speedMenuOpen && speedAnchor && (
          <div
            className="sim-speed-menu"
            style={{
              position: 'fixed',
              ...(speedAnchor.top !== undefined
                ? { top: speedAnchor.top }
                : { bottom: speedAnchor.bottom }),
              insetInlineStart: speedAnchor.start,
            }}
          >
            <div className="speed-menu-title">{t('sim.speed')}</div>
            <div className="speed-preset-pills">
              {SIM_SPEED_PRESETS.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  className={`speed-pill ${ui.simulationSpeed === sp ? 'active' : ''}`}
                  onClick={() => {
                    ui.setSimulationSpeed(sp);
                    setSpeedMenuOpen(false);
                  }}
                >
                  {simSpeedLabel(sp)}
                </button>
              ))}
            </div>
            <div className="speed-slider-row">
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={ui.simulationSpeed}
                onChange={(e) => ui.setSimulationSpeed(Number(e.target.value))}
                className="speed-range-slider"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
