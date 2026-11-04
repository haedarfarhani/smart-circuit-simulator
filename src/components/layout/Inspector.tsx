import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { makeT } from '../../i18n';
import { useCircuitStore } from '../../store/circuitStore';
import { DEFAULT_INSPECTOR_WIDTH, useUiStore } from '../../store/uiStore';
import { useSimulationStore } from '../../store/simulationStore';
import { SYMBOLS, switchLever, bjtBody } from '../../core/symbols';
import { formatValue } from '../../core/labels';
import { AnalyzerPanel } from '../panels/AnalyzerPanel';
import { LearningPanel } from '../panels/LearningPanel';
import { PracticePanel } from '../panels/PracticePanel';
import { EXAMPLE_CIRCUITS, getExample } from '../../core/examples';
import {
  isZenerDiode,
  getZenerParameters,
  ZENER_PRESETS,
  applyZenerPreset,
} from '../../core/zenerModel';
import { ZenerAnalyzer } from '../panels/ZenerAnalyzer';
import { UnitInput } from '../ui/UnitInput';
import { CapacitorInspector } from './CapacitorInspector';
import { BjtInspector } from './BjtInspector';
import { DigitalInspector } from './DigitalInspector';
import { isDigitalType } from '../../core/digital/types';

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
  const inspectorCollapsed = useUiStore((s) => s.inspectorCollapsed);
  const setInspectorCollapsed = useUiStore((s) => s.setInspectorCollapsed);
  const inspectorWidth = useUiStore((s) => s.inspectorWidth);
  const setInspectorWidth = useUiStore((s) => s.setInspectorWidth);
  const toggleInspector = useUiStore((s) => s.toggleInspector);
  const breakpoint = useUiStore((s) => s.breakpoint);
  const overlay = useUiStore((s) => s.overlay);
  const compact = breakpoint === 'tablet' || breakpoint === 'mobile';
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

  // On compact breakpoints the sheet is driven ONLY by the overlay state so the
  // backdrop can always close it. On desktop the floating panel shows whenever
  // the user has not collapsed it — its content follows the selection.
  const sheetOpen = compact ? overlay === 'inspector' : !inspectorCollapsed;

  // Selecting something on the canvas reopens a collapsed panel — there is
  // intentionally no big rail button, only the slim edge toggle.
  const prevSelectionCount = useRef(0);
  useEffect(() => {
    if (compact) return;
    const grew = selection.length > 0 && prevSelectionCount.current === 0;
    prevSelectionCount.current = selection.length;
    if (grew && inspectorCollapsed) setInspectorCollapsed(false);
  }, [selection, compact, inspectorCollapsed, setInspectorCollapsed]);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (compact) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const rtl = document.documentElement.dir === 'rtl';
    const move = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      // The panel sits on the inline-end edge: dragging towards the canvas
      // widens it, and the sign flips in RTL.
      setInspectorWidth(startWidth + (rtl ? delta : -delta), false);
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      document.body.classList.remove('resizing-inspector');
      setInspectorWidth(useUiStore.getState().inspectorWidth, true);
    };
    document.body.classList.add('resizing-inspector');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
  };

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
    <>
      {/* Floating edge toggle: always visible, chevron flips with the panel. */}
      <button
        type="button"
        className="edge-toggle edge-toggle-end"
        data-open={sheetOpen}
        aria-pressed={sheetOpen}
        title={sheetOpen ? t('inspector.close') : t('inspector.open')}
        aria-label={sheetOpen ? t('inspector.close') : t('inspector.open')}
        onClick={toggleInspector}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m10 3-5 5 5 5" />
        </svg>
      </button>

      <aside className="inspector" data-open={sheetOpen} aria-label={t('inspector.title')}>
      {!compact && (
        <div
          className="insp-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('inspector.resize') || 'Resize panel'}
          title={t('inspector.resize') || 'Drag to resize · double-click to reset'}
          onPointerDown={startResize}
          onDoubleClick={() => setInspectorWidth(DEFAULT_INSPECTOR_WIDTH)}
        />
      )}
      <div className="inspector-head">
        <div className="inspector-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setTab(tab.id)}
              title={tab.label}
            >
              <span className="tab-btn-icon">{tab.icon}</span>
              <span className="tab-btn-label">{tab.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="insp-collapse"
          onClick={toggleInspector}
          title={t('inspector.collapse') || 'Collapse panel'}
          aria-label={t('inspector.collapse') || 'Collapse panel'}
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="currentColor">
            <path d="M9.354 8 5.146 3.792l.708-.708L10.77 8l-4.916 4.916-.708-.708L9.354 8z" />
          </svg>
        </button>
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
                        {comp.type === 'bjtTransistor'
                          ? bjtBody(comp.transistorType ?? 'npn')
                          : SYMBOLS[comp.type].body}
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
                      {isZenerDiode(comp.type) && (
                        <>
                          <div className="telemetry-item rz">
                            <span className="telemetry-k">{t('zener.rzEffective') || 'rz'}</span>
                            <span className="telemetry-v">
                              {(compSolution.dynamicResistance ?? comp.zenerResistance ?? 10).toFixed(1)} Ω
                            </span>
                          </div>
                          {(compSolution.junctionTemp !== undefined || comp.dynamicThermal) && (
                            <div className="telemetry-item temp">
                              <span className="telemetry-k">{t('zener.junctionTemp') || 'Tj'}</span>
                              <span className="telemetry-v">
                                {(compSolution.junctionTemp ?? 25).toFixed(1)} °C
                              </span>
                            </div>
                          )}
                          {compSolution.effectiveVz !== undefined && (
                            <div className="telemetry-item effvz">
                              <span className="telemetry-k">{t('zener.effectiveVz') || 'Vz(Tj)'}</span>
                              <span className="telemetry-v">
                                {compSolution.effectiveVz.toFixed(2)} V
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      <div className="telemetry-item state">
                        <span className="telemetry-k">{t('inspector.state')}</span>
                        <span className="telemetry-v">
                          {isZenerDiode(comp.type)
                            ? compSolution.overload
                              ? 'OVERLOAD'
                              : compSolution.zenerState === 'breakdown'
                              ? 'Breakdown'
                              : compSolution.zenerState === 'forward'
                              ? 'Forward'
                              : 'Blocking'
                            : comp.type === 'switch'
                            ? comp.value === 1
                              ? 'Closed'
                              : 'Open'
                            : Math.abs(compSolution.current) > 1e-6
                            ? 'Conducting'
                            : 'Idle'}
                        </span>
                      </div>
                    </div>
                    {isZenerDiode(comp.type) && (
                      <div className="zener-power-bar-wrap" style={{ marginTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                          <span>{t('zener.dissipation') || 'Power Dissipation'}</span>
                          <span style={{ fontWeight: 600, color: compSolution.overload ? 'var(--danger)' : (compSolution.powerRatio ?? 0) > 0.8 ? 'var(--warn)' : 'var(--ok)' }}>
                            {((compSolution.powerRatio ?? 0) * 100).toFixed(0)}% ({compSolution.power.toFixed(3)}W / {(comp.ratedPower ?? 1).toFixed(1)}W)
                          </span>
                        </div>
                        <div style={{ height: '6px', background: 'var(--panel-3)', borderRadius: '3px', overflow: 'hidden', marginTop: '3px' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, (compSolution.powerRatio ?? 0) * 100)}%`,
                              background: compSolution.overload ? 'var(--danger)' : (compSolution.powerRatio ?? 0) > 0.8 ? 'var(--warn)' : 'var(--accent-2)',
                              transition: 'width 0.15s ease',
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Field label={t('inspector.label')}>
                  <input
                    value={comp.label}
                    onChange={(e) =>
                      store.updateComponents(
                        [comp.id],
                        { label: e.target.value },
                        `edit:label:${comp.id}`,
                      )
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
                    <UnitInput
                      value={comp.value}
                      ariaLabel={t('inspector.value')}
                      hint={t('inspector.unitHint')}
                      onChange={(v) => {
                        if (isZenerDiode(comp.type)) {
                          store.updateComponents([comp.id], { value: v, zenerVoltage: v, preset: 'custom' }, `edit:value:${comp.id}`);
                        } else {
                          store.updateComponents([comp.id], { value: v }, `edit:value:${comp.id}`);
                        }
                      }}
                    />
                  </Field>
                ) : null}

                {comp.type === 'polarized-capacitor' && (
                  <CapacitorInspector
                    comp={comp}
                    sol={compSolution ?? null}
                    update={(patch, tag) =>
                      store.updateComponents([comp.id], patch, tag)
                    }
                    t={t}
                    locale={locale}
                  />
                )}

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
                              ? '2.5px solid var(--text)'
                              : '1px solid var(--border-strong)',
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

                {/* Zener Diode Parameters, Presets, Thermal & Embedded Analyzer */}
                {isZenerDiode(comp.type) && (
                  <div className="zener-inspector-section" style={{ marginTop: '10px' }}>
                    <Field label={t('zener.preset') || 'Manufacturer Preset'}>
                      <select
                        value={comp.preset || '1N4733A'}
                        onChange={(e) => {
                          const key = e.target.value;
                          if (key !== 'custom' && ZENER_PRESETS[key]) {
                            store.updateComponents([comp.id], applyZenerPreset(key));
                          } else {
                            store.updateComponents([comp.id], { preset: 'custom' });
                          }
                        }}
                      >
                        <option value="custom">Custom Parameters</option>
                        {Object.entries(ZENER_PRESETS).map(([k, p]) => (
                          <option key={k} value={k}>
                            {p.name} — {p.vz}V
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label={t('zener.modelType') || 'Semiconductor Model'}>
                      <select
                        value={comp.zenerModel || 'piecewise-linear'}
                        onChange={(e) => {
                          store.updateComponents([comp.id], {
                            zenerModel: e.target.value as any,
                          });
                        }}
                      >
                        <option value="ideal">Ideal Zener (ideal clamp)</option>
                        <option value="piecewise-linear">Piecewise-Linear (Fast & Accurate Knee)</option>
                        <option value="advanced">Advanced Shockley + Avalanche Breakdown</option>
                      </select>
                    </Field>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                      <Field label={`${t('zener.dynamicResistance') || 'rz'} (Ω)`}>
                        <input
                          type="number"
                          step="0.5"
                          min="0.1"
                          value={comp.zenerResistance ?? 7}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v > 0) {
                              store.updateComponents([comp.id], { zenerResistance: v, preset: 'custom' });
                            }
                          }}
                        />
                      </Field>
                      <Field label={`${t('zener.ratedPower') || 'Pmax'} (W)`}>
                        <input
                          type="number"
                          step="0.1"
                          min="0.05"
                          value={comp.ratedPower ?? 1.0}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v > 0) {
                              store.updateComponents([comp.id], { ratedPower: v, preset: 'custom' });
                            }
                          }}
                        />
                      </Field>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                      <Field label={`${t('zener.testCurrent') || 'Izt'} (mA)`}>
                        <input
                          type="number"
                          step="1"
                          min="0.1"
                          value={((comp.zenerTestCurrent ?? 0.049) * 1000).toFixed(1)}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v > 0) {
                              store.updateComponents([comp.id], { zenerTestCurrent: v / 1000, preset: 'custom' });
                            }
                          }}
                        />
                      </Field>
                      <Field label={`${t('zener.kneeCurrent') || 'Izk'} (mA)`}>
                        <input
                          type="number"
                          step="0.1"
                          min="0.01"
                          value={((comp.zenerKneeCurrent ?? 0.001) * 1000).toFixed(2)}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v > 0) {
                              store.updateComponents([comp.id], { zenerKneeCurrent: v / 1000, preset: 'custom' });
                            }
                          }}
                        />
                      </Field>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                      <Field label={`${t('zener.forwardVoltage') || 'Vf'} (V)`}>
                        <input
                          type="number"
                          step="0.05"
                          min="0.2"
                          max="2.0"
                          value={comp.forwardVoltage ?? 0.75}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v > 0) {
                              store.updateComponents([comp.id], { forwardVoltage: v, preset: 'custom' });
                            }
                          }}
                        />
                      </Field>
                      <Field label={`${t('zener.leakage') || 'Ileak'} (µA)`}>
                        <input
                          type="number"
                          step="1"
                          min="0.01"
                          value={((comp.reverseLeakage ?? 1e-5) * 1e6).toFixed(1)}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v >= 0) {
                              store.updateComponents([comp.id], { reverseLeakage: v * 1e-6, preset: 'custom' });
                            }
                          }}
                        />
                      </Field>
                    </div>

                    {/* Thermal Simulation Settings */}
                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={comp.dynamicThermal ?? false}
                            onChange={(e) => {
                              store.updateComponents([comp.id], { dynamicThermal: e.target.checked });
                            }}
                          />
                          <span>{t('zener.dynamicThermal') || 'Dynamic Thermal Model'}</span>
                        </label>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                        <Field label={t('zener.tempCoeff') || 'α'}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <input
                              type="number"
                              step="0.1"
                              value={comp.tempCoeff ?? 1.2}
                              style={{ flex: 1, minWidth: 0 }}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (Number.isFinite(v)) {
                                  store.updateComponents([comp.id], { tempCoeff: v, preset: 'custom' });
                                }
                              }}
                            />
                            <select
                              aria-label={t('zener.tempCoeffUnit') || 'Temperature coefficient unit'}
                              value={comp.tempCoeffUnit ?? 'mV'}
                              style={{ width: '78px' }}
                              onChange={(e) => {
                                store.updateComponents([comp.id], {
                                  tempCoeffUnit: e.target.value as 'mV' | 'V' | 'percent',
                                  preset: 'custom',
                                });
                              }}
                            >
                              <option value="mV">mV/°C</option>
                              <option value="V">V/°C</option>
                              <option value="percent">%/°C</option>
                            </select>
                          </div>
                        </Field>
                        <Field label={`${t('zener.ambientTemp') || 'Ambient'} (°C)`}>
                          <input
                            type="number"
                            step="1"
                            value={comp.ambientTemp ?? 25}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (Number.isFinite(v)) {
                                store.updateComponents([comp.id], { ambientTemp: v, preset: 'custom' });
                              }
                            }}
                          />
                        </Field>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                        <Field label={`${t('zener.maxJunctionTemp') || 'Tj,max'} (°C)`}>
                          <input
                            type="number"
                            step="5"
                            min="25"
                            value={comp.maxJunctionTemp ?? 150}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (Number.isFinite(v) && v > 0) {
                                store.updateComponents([comp.id], { maxJunctionTemp: v, preset: 'custom' });
                              }
                            }}
                          />
                        </Field>
                        {comp.dynamicThermal && (
                          <Field label={`${t('zener.thermalCapacitance') || 'Cth'} (J/°C)`}>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={comp.thermalCapacitance ?? 0.08}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (Number.isFinite(v) && v > 0) {
                                  store.updateComponents([comp.id], { thermalCapacitance: v, preset: 'custom' });
                                }
                              }}
                            />
                          </Field>
                        )}
                      </div>

                      {comp.dynamicThermal && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                          <Field label={`${t('zener.thermalResistance') || 'Rth'} (°C/W)`}>
                            <input
                              type="number"
                              step="10"
                              min="1"
                              value={comp.thermalResistance ?? 100}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (Number.isFinite(v) && v > 0) {
                                  store.updateComponents([comp.id], { thermalResistance: v, preset: 'custom' });
                                }
                              }}
                            />
                          </Field>
                        </div>
                      )}
                    </div>

                    {/* Embedded I-V Analyzer */}
                    <div style={{ marginTop: '12px' }}>
                      <ZenerAnalyzer
                        params={getZenerParameters(comp)}
                        tj={compSolution?.junctionTemp ?? comp.ambientTemp ?? 25}
                        currentOperatingPoint={compSolution ? {
                          voltage: compSolution.voltage,
                          current: compSolution.current,
                          state: compSolution.zenerState === 'blocking'
                            ? 'reverse-blocking'
                            : compSolution.zenerState === 'forward' || compSolution.zenerState === 'breakdown'
                            ? compSolution.zenerState
                            : undefined,
                          dynamicResistance: compSolution.dynamicResistance,
                        } : undefined}
                        t={t}
                      />
                    </div>
                  </div>
                )}

                {/* Bipolar Junction Transistor: live operating point, model,
                    ratings, thermal behaviour, probes and curve analyzer. */}
                {comp.type === 'bjtTransistor' && (
                  <BjtInspector
                    comp={comp}
                    sol={compSolution}
                    update={(patch, tag) => store.updateComponents([comp.id], patch, tag)}
                    t={t}
                    locale={locale}
                  />
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

                {/* Digital logic components: family, implicit supply,
                    configuration and live logic telemetry. */}
                {isDigitalType(comp.type) && <DigitalInspector comp={comp} />}

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
                    data-active={comp.mirrored === true}
                    onClick={() => {
                      store.updateComponents([comp.id], { mirrored: !comp.mirrored });
                      useUiStore.getState().setStatus('status.mirrored');
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                      <path d="M8 1v14" strokeDasharray="2 1.5" />
                      <path d="M6 4 2 8l4 4V4z" fill="currentColor" stroke="none" />
                      <path d="M10 4l4 4-4 4V4z" fill="none" />
                    </svg>
                    <span>{t('inspector.mirrorBtn')}</span>
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
    </>
  );
}
