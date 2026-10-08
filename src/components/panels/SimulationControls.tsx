import { useSimulationStore, SIM_SPEED_PRESETS, simSpeedLabel, type SimSpeedPreset } from '../../store/simulationStore';
import { useUiStore } from '../../store/uiStore';
import { makeT } from '../../i18n';

/**
 * Time-domain simulation transport controls.
 *
 * The buttons control the independent simulation clock
 * (Run / Pause / Stop / Reset / single step) and the
 * simulation speed — how fast simulation time advances
 * relative to the wall clock. Speed never changes the
 * electrical equations; the fixed dt timestep is unchanged.
 */
export function SimulationControls() {
  const locale = useUiStore((s) => s.locale);
  const t = makeT(locale);
  const status = useSimulationStore((s) => s.status);
  const simTime = useSimulationStore((s) => s.simTime);
  const simulationSpeed = useUiStore((s) => s.simulationSpeed);
  const dt = useSimulationStore((s) => s.dt);

  const running = status === 'running';

  const formatTime = (s: number) => {
    if (s < 1e-3) return `${(s * 1e6).toFixed(0)} µs`;
    if (s < 1) return `${(s * 1e3).toFixed(2)} ms`;
    return `${s.toFixed(3)} s`;
  };

  return (
    <div className="sim-controls">
      <div className="sim-controls-row">
        {!running ? (
          <button
            type="button"
            className="sim-ctl-btn run"
            onClick={() => useSimulationStore.getState().start()}
            title={t('sim.run') || 'Run'}
          >
            ▶ {t('sim.run') || 'Run'}
          </button>
        ) : (
          <button
            type="button"
            className="sim-ctl-btn pause"
            onClick={() => useSimulationStore.getState().pause()}
            title={t('sim.pause') || 'Pause'}
          >
            ⏸ {t('sim.pause') || 'Pause'}
          </button>
        )}
        <button
          type="button"
          className="sim-ctl-btn"
          onClick={() => useSimulationStore.getState().stop()}
          title={t('sim.stop') || 'Stop'}
        >
          ⏹ {t('sim.stop') || 'Stop'}
        </button>
        <button
          type="button"
          className="sim-ctl-btn"
          onClick={() => useSimulationStore.getState().reset()}
          title={t('sim.reset') || 'Reset'}
        >
          ↺ {t('sim.reset') || 'Reset'}
        </button>
        <button
          type="button"
          className="sim-ctl-btn"
          disabled={running}
          onClick={() => useSimulationStore.getState().singleStep()}
          title={t('sim.step') || 'Step one timestep'}
        >
          ⏭ {t('sim.step') || 'Step'}
        </button>
        <div className="sim-clock" title={t('sim.clock') || 'Simulation clock'}>
          <span className="sim-clock-label">{t('sim.time') || 't'}</span>
          <span className="sim-clock-value">{formatTime(simTime)}</span>
          <span className="sim-clock-dt">dt = {(dt * 1e6).toFixed(0)} µs</span>
        </div>
      </div>
      <div className="sim-controls-row">
        <span className="sim-speed-label">{t('sim.speed') || 'Speed'}</span>
        <div className="sim-speed-presets" role="group" aria-label={t('sim.speed') || 'Speed'}>
          {SIM_SPEED_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`sim-speed-btn ${simulationSpeed === p ? 'active' : ''}`}
              onClick={() =>
                useSimulationStore.getState().setSimSpeed(p as SimSpeedPreset)
              }
            >
              {simSpeedLabel(p)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
