import type { ReactNode } from 'react';
import { makeT } from '../../i18n';
import { useCircuitStore } from '../../store/circuitStore';
import { useUiStore } from '../../store/uiStore';
import { useSimulationStore } from '../../store/simulationStore';
import { SYMBOLS, switchLever } from '../../core/symbols';
import { formatValue } from '../../core/labels';
import { AnalyzerPanel } from '../panels/AnalyzerPanel';
import { LearningPanel } from '../panels/LearningPanel';
import { PracticePanel } from '../panels/PracticePanel';
import { EXAMPLE_CIRCUITS, getExample } from '../../core/examples';

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Inspector() {
  const locale = useUiStore((s) => s.locale);
  const t = makeT(locale);
  const selection = useUiStore((s) => s.selection);
  const doc = useCircuitStore((s) => s.doc);
  const store = useCircuitStore();

  const activeTab = useUiStore((s) => s.inspectorTab);
  const setTab = useUiStore((s) => s.setInspectorTab);
  const simulationEnabled = useUiStore((s) => s.simulationEnabled);
  const snapshot = useSimulationStore((s) => s.snapshot);
  const solverResult = useSimulationStore((s) => s.solverResult);

  const selectedComps = doc.components.filter((c) => selection.includes(c.id));
  const selectedWires = doc.wires.filter((w) => selection.includes(w.id));
  const single = selectedComps.length === 1 && selectedWires.length === 0;
  const comp = single ? selectedComps[0] : null;
  const wire = selectedWires.length === 1 && selectedComps.length === 0 ? selectedWires[0] : null;
  // Live telemetry: prefer the time-domain snapshot when simulation is running,
  // fall back to the steady-state solver result when not.
  const compSolution =
    comp &&
    (snapshot?.componentData.get(comp.id) ??
      solverResult?.componentData.get(comp.id) ??
      null);

  const open = selection.length > 0 || activeTab !== 'properties';

  const endLabel = (end: { componentId: string | null; terminalIndex: number; point: { x: number; y: number } | null }) => {
    if (end.componentId) {
      const c = doc.components.find((x) => x.id === end.componentId);
      return c ? `${c.label} · #${end.terminalIndex + 1}` : '—';
    }
    if (end.point) return `(${end.point.x}, ${end.point.y})`;
    return '—';
  };

  const tabs = [
    {
      id: 'properties',
      label: t('tab.properties') || 'Properties',
      icon: (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z" />
        </svg>
      ),
    },
    {
      id: 'analysis',
      label: t('tab.analysis') || 'Analysis',
      icon: (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-4zm6-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7zm6-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V2z" />
        </svg>
      ),
    },
    {
      id: 'learning',
      label: t('tab.learning') || 'Learning',
      icon: (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.211 2.047a.5.5 0 0 0-.422 0l-7.5 3.5a.5.5 0 0 0 .025.917l7.5 3a.5.5 0 0 0 .372 0L14 7.14V13a1 1 0 0 0-1 1v2h3v-2a1 1 0 0 0-1-1V6.733l.786-.369a.5.5 0 0 0 .025-.917l-7.5-3.5z" />
        </svg>
      ),
    },
    {
      id: 'practice',
      label: t('tab.practice') || 'Practice',
      icon: (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2.5.5A.5.5 0 0 1 3 0h10a.5.5 0 0 1 .5.5c0 .538-.012 1.05-.034 1.536a3 3 0 1 1-1.133 5.89c-.79 1.865-1.878 2.774-3.333 3.01v2.064h2a.5.5 0 0 1 0 1h-6a.5.5 0 0 1 0-1h2V10.936c-1.455-.236-2.543-1.145-3.333-3.01a3 3 0 1 1-1.133-5.89A33.07 33.07 0 0 1 2.5.5z" />
        </svg>
      ),
    },
  ] as const;

  return (
    <aside className="inspector" data-open={open} aria-label={t('inspector.title')}>
      <div className="inspector-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setTab(tab.id)}
          >
            <span className="tab-btn-icon">{tab.icon}</span>
            <span className="tab-btn-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="inspector-content">
        {activeTab === 'analysis' && <AnalyzerPanel />}
        {activeTab === 'learning' && <LearningPanel />}
        {activeTab === 'practice' && <PracticePanel />}

        {activeTab === 'properties' && (
          <>
            {comp && (
              <div className="insp-card">
                <div className="insp-header-row">
                  <div className="insp-sym-badge">
                    <svg
                      viewBox={`-20 -20 40 40`}
                      width="28"
                      height="28"
                      aria-hidden="true"
                    >
                      <g className="sym-group" style={{ color: 'var(--accent)' }}>
                        {SYMBOLS[comp.type].body}
                        {comp.type === 'switch' && switchLever(comp.value === 1)}
                      </g>
                    </svg>
                  </div>
                  <div className="insp-title-box">
                    <div className="insp-comp-name">{comp.label}</div>
                    <div className="insp-comp-kind">
                      {t(`lib.component.${comp.type}`)} ·{' '}
                      {SYMBOLS[comp.type].unit
                        ? formatValue(comp.value, SYMBOLS[comp.type].unit)
                        : `${SYMBOLS[comp.type].terminals.length} ${t(
                            SYMBOLS[comp.type].terminals.length === 1
                              ? 'inspector.terminal'
                              : 'inspector.terminals',
                          )}`}
                    </div>
                  </div>
                </div>

                {/* Live Telemetry Pill Card */}
                {simulationEnabled && compSolution && (
                  <div className="telemetry-card">
                    <div className="telemetry-title">{t('inspector.telemetry')}</div>
                    <div className="telemetry-grid">
                      <div className="telemetry-item volt">
                        <span className="telemetry-k">{t('inspector.voltage')}</span>
                        <span className="telemetry-v">{compSolution.voltage.toFixed(2)} V</span>
                      </div>
                      <div className="telemetry-item curr">
                        <span className="telemetry-k">{t('inspector.current')}</span>
                        <span className="telemetry-v">{compSolution.current.toFixed(3)} A</span>
                      </div>
                      <div className="telemetry-item pow">
                        <span className="telemetry-k">{t('inspector.power')}</span>
                        <span className="telemetry-v">{compSolution.power.toFixed(3)} W</span>
                      </div>
                      {compSolution.ac && (
                        <div className="telemetry-item ac">
                          <span className="telemetry-k">{t('inspector.acRms')}</span>
                          <span className="telemetry-v">
                            {compSolution.frequency
                              ? `${compSolution.frequency} Hz`
                              : 'AC'}
                          </span>
                        </div>
                      )}
                      <div className="telemetry-item state">
                        <span className="telemetry-k">{t('inspector.state')}</span>
                        <span className="telemetry-v">
                          {comp.type === 'switch'
                            ? comp.value === 1
                              ? 'Closed'
                              : 'Open'
                            : Math.abs(compSolution.current) > 1e-6
                            ? 'Conducting'
                            : 'Idle'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <Field label={t('inspector.label')}>
                  <input
                    value={comp.label}
                    onChange={(e) =>
                      store.updateComponents([comp.id], { label: e.target.value })
                    }
                    spellCheck={false}
                  />
                </Field>

                {SYMBOLS[comp.type].unit !== '' || comp.type === 'switch' ? (
                  <Field
                    label={`${t('inspector.value')}${
                      SYMBOLS[comp.type].unit ? ` (${SYMBOLS[comp.type].unit})` : ''
                    }`}
                  >
                    <input
                      type="number"
                      step="any"
                      value={comp.value}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) {
                          store.updateComponents([comp.id], { value: v });
                        }
                      }}
                    />
                  </Field>
                ) : null}

                {/* LED Color Picker Palette */}
                {comp.type === 'led' && (
                  <Field label={t('inspector.color') || 'LED Color'}>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      {(
                        [
                          { id: 'red', hex: '#ef4444' },
                          { id: 'green', hex: '#22c55e' },
                          { id: 'blue', hex: '#3b82f6' },
                          { id: 'yellow', hex: '#eab308' },
                          { id: 'purple', hex: '#a855f7' },
                          { id: 'white', hex: '#f8fafc' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          title={item.id}
                          onClick={() => store.updateComponents([comp.id], { color: item.id })}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: item.hex,
                            border: (comp.color || 'red') === item.id
                              ? '2.5px solid #ffffff'
                              : '1px solid rgba(255,255,255,0.2)',
                            cursor: 'pointer',
                            outline: 'none',
                            boxShadow: (comp.color || 'red') === item.id
                              ? `0 0 8px ${item.hex}`
                              : 'none',
                            transition: 'all 0.15s ease',
                          }}
                        />
                      ))}
                    </div>
                  </Field>
                )}

                {/* AC Source & AC Motor Frequency */}
                {(comp.type === 'acVoltageSource' || comp.type === 'acMotor') && (
                  <Field label={`${t('inspector.frequency') || 'Frequency'} (Hz)`}>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="10000"
                      value={comp.frequency ?? 50}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v) && v > 0) {
                          store.updateComponents([comp.id], { frequency: v });
                        }
                      }}
                    />
                  </Field>
                )}

                {/* AC Voltage Source: real sinusoidal parameters.
                    The value field above is the RMS voltage; the
                    instantaneous waveform is
                    v(t) = Voffset + Vrms·√2·sin(2πft + φ). */}
                {comp.type === 'acVoltageSource' && (
                  <div className="ac-source-params">
                    <div className="ac-peak-readout">
                      <span>
                        {t('inspector.vRms') || 'RMS Voltage'}
                      </span>
                      <b>{comp.value.toFixed(2)} V</b>
                    </div>
                    <div className="ac-peak-readout">
                      <span>{t('inspector.vPeak') || 'Peak Voltage'}</span>
                      <b>{(comp.value * Math.SQRT2).toFixed(2)} V</b>
                    </div>
                    <Field label={`${t('inspector.phase') || 'Phase'} (°)`}>
                      <input
                        type="number"
                        step="any"
                        value={comp.phaseDeg ?? 0}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (Number.isFinite(v)) {
                            store.updateComponents([comp.id], {
                              phaseDeg: ((v % 360) + 360) % 360,
                            });
                          }
                        }}
                      />
                    </Field>
                    <Field label={`${t('inspector.offset') || 'Offset'} (V)`}>
                      <input
                        type="number"
                        step="any"
                        value={comp.offset ?? 0}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (Number.isFinite(v)) {
                            store.updateComponents([comp.id], { offset: v });
                          }
                        }}
                      />
                    </Field>
                  </div>
                )}

                {SYMBOLS[comp.type].defaultInductance !== undefined && (
                  <Field label={`${t('inspector.inductance')} (H)`}>
                    <input
                      type="number"
                      step="any"
                      value={
                        comp.inductance ??
                        SYMBOLS[comp.type].defaultInductance ??
                        0
                      }
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) {
                          store.updateComponents([comp.id], { inductance: v });
                        }
                      }}
                    />
                  </Field>
                )}

                {comp.type === 'switch' && (
                  <div className="switch-toggle-row">
                    <button
                      type="button"
                      className={`switch-segment ${comp.value === 0 ? 'active' : ''}`}
                      onClick={() => store.updateComponents([comp.id], { value: 0 })}
                    >
                      ○ Open
                    </button>
                    <button
                      type="button"
                      className={`switch-segment ${comp.value === 1 ? 'active' : ''}`}
                      onClick={() => store.updateComponents([comp.id], { value: 1 })}
                    >
                      ● Closed
                    </button>
                  </div>
                )}

                <Field label={t('inspector.position')}>
                  <div className="field-row">
                    <div className="coord-input-wrap">
                      <span className="coord-label">X</span>
                      <input
                        type="number"
                        step="10"
                        value={comp.x}
                        aria-label="X"
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (Number.isFinite(v)) store.updateComponents([comp.id], { x: v });
                        }}
                      />
                    </div>
                    <div className="coord-input-wrap">
                      <span className="coord-label">Y</span>
                      <input
                        type="number"
                        step="10"
                        value={comp.y}
                        aria-label="Y"
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (Number.isFinite(v)) store.updateComponents([comp.id], { y: v });
                        }}
                      />
                    </div>
                  </div>
                </Field>

                <div className="insp-actions-row">
                  <button
                    type="button"
                    className="insp-action-btn"
                    onClick={() => {
                      store.rotateComponents([comp.id]);
                      useUiStore.getState().setStatus('status.rotated');
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13.5 8a5.5 5.5 0 11-5.5-5.5" />
                      <path d="M8 1.5v3M8 1.5l2.5 1.5" />
                    </svg>
                    <span>{t('inspector.rotateBtn')}</span>
                  </button>

                  <button
                    type="button"
                    className="insp-action-btn"
                    onClick={() => {
                      const ids = store.duplicateComponents([comp.id]);
                      if (ids.length) useUiStore.getState().select(ids);
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z" />
                    </svg>
                    <span>{t('inspector.duplicate')}</span>
                  </button>

                  <button
                    type="button"
                    className="insp-action-btn danger"
                    onClick={() => {
                      store.deleteElements([comp.id]);
                      useUiStore.getState().clearSelection();
                      useUiStore.getState().setStatus('status.deleted');
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 4h11M6.5 4V2.5a1 1 0 011-1h1a1 1 0 011 1V4M4 4l.7 9a1.5 1.5 0 001.5 1.4h3.6a1.5 1.5 0 001.5-1.4L12 4" />
                    </svg>
                    <span>{t('inspector.delete')}</span>
                  </button>
                </div>
              </div>
            )}

            {!comp && wire && (
              <div className="insp-card">
                <div className="insp-comp-name">{t('inspector.wire')}</div>
                <div className="wire-meta-box">
                  <div className="wire-meta-item">
                    <span className="wire-meta-k">{t('inspector.wireFrom')}</span>
                    <span className="wire-meta-v">{endLabel(wire.start)}</span>
                  </div>
                  <div className="wire-meta-item">
                    <span className="wire-meta-k">{t('inspector.wireTo')}</span>
                    <span className="wire-meta-v">{endLabel(wire.end)}</span>
                  </div>
                </div>

                <div className="insp-actions-row">
                  <button
                    type="button"
                    className="insp-action-btn danger"
                    onClick={() => {
                      store.deleteElements([wire.id]);
                      useUiStore.getState().clearSelection();
                      useUiStore.getState().setStatus('status.deleted');
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 4h11M6.5 4V2.5a1 1 0 011-1h1a1 1 0 011 1V4M4 4l.7 9a1.5 1.5 0 001.5 1.4h3.6a1.5 1.5 0 001.5-1.4L12 4" />
                    </svg>
                    <span>{t('inspector.delete')}</span>
                  </button>
                </div>
              </div>
            )}

            {!comp && !wire && selection.length > 1 && (
              <div className="insp-card">
                <div className="insp-comp-name">{selection.length}</div>
                <div className="insp-comp-kind">{t('inspector.multi')}</div>
                <div className="insp-actions-row">
                  <button
                    type="button"
                    className="insp-action-btn"
                    onClick={() => {
                      const ids = store.duplicateComponents(
                        selection.filter((id) => doc.components.some((c) => c.id === id)),
                      );
                      if (ids.length) useUiStore.getState().select(ids);
                    }}
                  >
                    {t('inspector.duplicate')}
                  </button>
                  <button
                    type="button"
                    className="insp-action-btn danger"
                    onClick={() => {
                      store.deleteElements(selection);
                      useUiStore.getState().clearSelection();
                      useUiStore.getState().setStatus('status.deleted');
                    }}
                  >
                    {t('inspector.delete')}
                  </button>
                </div>
              </div>
            )}

            {!comp && !wire && selection.length === 0 && (
              <div className="insp-empty-state">
                <div className="empty-state-visual">
                  <div className="empty-state-pulse" />
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                <div className="empty-state-heading">{t('inspector.none')}</div>
                <p className="empty-state-hint">{t('inspector.noneHint')}</p>

                {/* Quick Example Circuits */}
                <div className="quick-presets-box">
                  <div className="presets-title">{t('examples.title')}</div>
                  <div className="presets-list">
                    {EXAMPLE_CIRCUITS.map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        className="preset-chip-btn"
                        onClick={() => {
                          const result = getExample(ex.id);
                          if (result) {
                            store.setDoc(result.doc);
                            useUiStore.getState().clearSelection();
                            useUiStore.getState().setSimulationEnabled(true);
                          }
                        }}
                      >
                        <span className="preset-chip-dot" />
                        <span className="preset-chip-name">{t(ex.nameKey)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Keyboard Shortcuts Summary */}
                <div className="insp-shortcuts-box">
                  <div className="presets-title">{t('key.title')}</div>
                  <div className="shortcuts-grid">
                    <div className="shortcut-row"><kbd>V</kbd><span>{t('key.select')}</span></div>
                    <div className="shortcut-row"><kbd>W</kbd><span>{t('key.wire')}</span></div>
                    <div className="shortcut-row"><kbd>R</kbd><span>{t('key.rotate')}</span></div>
                    <div className="shortcut-row"><kbd>Del</kbd><span>{t('key.delete')}</span></div>
                    <div className="shortcut-row"><kbd>Ctrl+Z</kbd><span>{t('key.undo')}</span></div>
                    <div className="shortcut-row"><kbd>Ctrl+A</kbd><span>{t('key.selectAll')}</span></div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
