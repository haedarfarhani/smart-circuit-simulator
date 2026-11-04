import type { ReactNode } from 'react';
import type { CircuitComponent } from '../../models/circuit';
import type { ComponentSolution } from '../../core/solver';
import {
  CAPACITOR_EXPLANATIONS,
  CAPACITOR_PRESETS,
  applyCapacitorPreset,
  getCapacitorParameters,
  rcChargeDuration,
  rcDischargeDuration,
  seriesCapacitance,
  parallelCapacitance,
  type CapacitorExplanationTopic,
} from '../../core/capacitorModel';
import { formatValue } from '../../core/labels';
import { useSimulationStore } from '../../store/simulationStore';
import { useProbeStore } from '../../store/probeStore';
import { useUiStore } from '../../store/uiStore';

interface Props {
  comp: CircuitComponent;
  sol: ComponentSolution | null;
  update: (patch: Partial<CircuitComponent>, tag?: string) => void;
  t: (key: string) => string;
  locale: 'en' | 'fa';
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details
      className="cap-section"
      open
      style={{
        marginTop: 10,
        paddingTop: 8,
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: '0.02em',
          color: 'var(--text-muted)',
        }}
      >
        {title}
      </summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>{children}</div>
    </details>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v) && (min === undefined || v >= min)) onChange(v);
        }}
      />
    </Field>
  );
}

const fmt = (v: number | undefined, digits = 3, unit = ''): string => {
  if (v === undefined || !Number.isFinite(v)) return `— ${unit}`.trim();
  return `${v.toFixed(digits)} ${unit}`.trim();
};

const TOPICS: CapacitorExplanationTopic[] = [
  'capacitance',
  'charge',
  'energy',
  'esr',
  'esl',
  'leakage',
  'ripple',
  'timeConstant',
  'dielectricAbsorption',
  'polarization',
  'charging',
  'discharging',
  'reversePolarity',
  'overvoltage',
  'highRipple',
  'thermal',
];

/**
 * Polarized capacitor inspector. Every live value comes from the simulation
 * snapshot (`solution.capacitor`); nothing here invents a measurement.
 */
export function CapacitorInspector({ comp, sol, update, t, locale }: Props) {
  const params = getCapacitorParameters(comp);
  const live = sol?.capacitor;
  const topology = useSimulationStore((s) => s.topology);

  const tag = (name: string) => `cap:${name}:${comp.id}`;
  const rLeakMOhm = params.leakageResistance / 1e6;

  const attachProbe = (kind: 'voltage' | 'current') => {
    const channels = useProbeStore.getState().channels;
    const target =
      channels.find(
        (c) =>
          c.positiveNodeId == null && c.negativeNodeId == null && c.branchId == null,
      ) ?? channels[0];
    if (!target) return;
    if (kind === 'current') {
      useProbeStore.getState().updateChannel(target.id, {
        enabled: true,
        type: 'current',
        branchId: comp.id,
        branchKind: 'component',
        positiveNodeId: null,
        negativeNodeId: null,
        useGroundRef: false,
        positivePoint: { x: comp.x, y: comp.y },
        negativePoint: null,
        label: comp.label,
      });
    } else {
      const topoComp = topology?.components.find((c) => c.id === comp.id);
      if (!topoComp?.nodeA || !topoComp?.nodeB) return;
      useProbeStore.getState().updateChannel(target.id, {
        enabled: true,
        type: 'voltage',
        positiveNodeId: topoComp.nodeA,
        negativeNodeId: topoComp.nodeB,
        useGroundRef: false,
        positivePoint: { x: comp.x - 40, y: comp.y },
        negativePoint: { x: comp.x + 40, y: comp.y },
        branchId: null,
        branchKind: null,
        label: comp.label,
      });
    }
    const ui = useUiStore.getState();
    ui.setBottomPanelTab('oscilloscope');
    ui.setSimulationEnabled(true);
  };

  const warnings: string[] = [];
  if (live?.breakdown) warnings.push(t('cap.breakdown'));
  if (live?.polarity === 'reverse') warnings.push(t('cap.warn.reverse'));
  if (live?.overvoltage) warnings.push(t('cap.warn.overvoltage'));
  if (live?.overRipple) warnings.push(t('cap.warn.ripple'));
  if (live?.thermalState === 'hot' || live?.thermalState === 'over')
    warnings.push(t('cap.warn.thermal'));

  return (
    <div className="cap-inspector" style={{ marginTop: 10 }}>
      {warnings.length > 0 && (
        <div
          role="alert"
          style={{
            display: 'grid',
            gap: 4,
            marginBottom: 8,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--danger, #ef4444)',
            background: 'rgba(239,68,68,0.10)',
            color: 'var(--danger, #ef4444)',
            fontSize: 10.5,
            lineHeight: 1.45,
          }}
        >
          {warnings.map((w) => (
            <span key={w}>⚠ {w}</span>
          ))}
          {live && live.reverseVoltage > 0 && (
            <span>
              {t('cap.reverseVoltage')}: {fmt(live.reverseVoltage, 3, 'V')} ·{' '}
              {t('cap.severity')}: {live.reverseSeverity.toUpperCase()} ·
              {t('cap.reverseDuration')}: {fmt(live.reverseDuration, 3, 's')}
            </span>
          )}
        </div>
      )}

      <Section title={t('cap.section.general')}>
        <Field label={t('cap.preset')}>
          <select
            value={CAPACITOR_PRESETS[comp.preset ?? ''] ? comp.preset : 'custom'}
            onChange={(e) => {
              const key = e.target.value;
              if (CAPACITOR_PRESETS[key]) {
                update(applyCapacitorPreset(key), tag('preset'));
              } else {
                update({ preset: 'custom' }, tag('preset'));
              }
            }}
          >
            {Object.values(CAPACITOR_PRESETS).map((preset) => (
              <option key={preset.key} value={preset.key}>
                {preset.label}
              </option>
            ))}
            <option value="custom">{t('cap.presetCustom')}</option>
          </select>
        </Field>
        <Field label={t('cap.technology')}>
          <select
            value={params.technology}
            onChange={(e) =>
              update({ technology: e.target.value as typeof params.technology }, tag('tech'))
            }
          >
            {(
              ['aluminum-electrolytic', 'tantalum', 'polymer', 'custom'] as const
            ).map((tech) => (
              <option key={tech} value={tech}>
                {t(`cap.tech.${tech}`)}
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          label={t('cap.tolerance')}
          value={params.tolerance}
          min={0}
          step={1}
          onChange={(v) => update({ tolerance: v, preset: 'custom' }, tag('tol'))}
        />
      </Section>

      <Section title={t('cap.section.capacitance')}>
        <NumberField
          label={t('cap.ratedVoltage')}
          value={params.ratedVoltage}
          min={0.1}
          step={1}
          onChange={(v) => update({ ratedVoltage: v, preset: 'custom' }, tag('vr'))}
        />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
          <input
            type="checkbox"
            checked={params.initialConditionEnabled}
            onChange={(e) =>
              update({ initialConditionEnabled: e.target.checked }, tag('ic'))
            }
          />
          <span>{t('cap.initialCondition')}</span>
        </label>
        {params.initialConditionEnabled && (
          <>
            <NumberField
              label={t('cap.initialVoltage')}
              value={params.initialVoltage}
              step={0.1}
              onChange={(v) =>
                update(
                  {
                    initialVoltage: v,
                    initialCharge: v * params.capacitance,
                    initialConditionEnabled: true,
                  },
                  tag('v0'),
                )
              }
            />
            <NumberField
              label={t('cap.initialCharge')}
              value={params.initialCharge}
              step={1e-4}
              onChange={(v) =>
                update(
                  {
                    initialCharge: v,
                    initialVoltage:
                      params.capacitance > 0 ? v / params.capacitance : 0,
                    initialConditionEnabled: true,
                  },
                  tag('q0'),
                )
              }
            />
          </>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
          τ = R·C, charge to 99%: {fmt(rcChargeDuration(1000, params.capacitance, 0.99), 3, 's')}{' '}
          at 1 kΩ · discharge to 1%:{' '}
          {fmt(rcDischargeDuration(1000, params.capacitance, 0.01), 3, 's')}
        </div>
      </Section>

      <Section title={t('cap.section.polarity')}>
        <Field label={t('cap.model')}>
          <select
            value={params.model}
            onChange={(e) =>
              update(
                { capacitorModel: e.target.value as typeof params.model },
                tag('model'),
              )
            }
          >
            <option value="ideal">{t('cap.model.ideal')}</option>
            <option value="realistic">{t('cap.model.realistic')}</option>
          </select>
        </Field>
        <NumberField
          label={t('cap.reverseBreakdown')}
          value={params.reverseBreakdownVoltage}
          min={0}
          step={0.1}
          onChange={(v) =>
            update(
              { reverseBreakdownVoltage: v, preset: 'custom' },
              tag('vbd'),
            )
          }
        />
        <Field label={t('cap.failure')}>
          <select
            value={params.failureBehavior}
            onChange={(e) =>
              update(
                { failureBehavior: e.target.value as typeof params.failureBehavior },
                tag('fail'),
              )
            }
          >
            <option value="breakdown-conduction">
              {t('cap.failure.breakdown-conduction')}
            </option>
            <option value="open">{t('cap.failure.open')}</option>
            <option value="short">{t('cap.failure.short')}</option>
          </select>
        </Field>
        <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
          Vc = V(+) − V(−). Reverse voltage is reported, never clamped or
          hidden.
        </div>
      </Section>

      <Section title={t('cap.section.esr')}>
        <NumberField
          label={t('cap.esr')}
          value={params.esr}
          min={0}
          step={0.01}
          onChange={(v) => update({ esr: v, preset: 'custom' }, tag('esr'))}
        />
        <NumberField
          label={t('cap.esl')}
          value={params.esl * 1e9}
          min={0}
          step={0.5}
          onChange={(v) => update({ esl: v * 1e-9, preset: 'custom' }, tag('esl'))}
        />
        {params.esl > 0 && params.integration === 'trapezoidal' && (
          <div style={{ fontSize: 10, color: 'var(--warn, #f59e0b)' }}>
            ESL forces backward Euler for numerical stability.
          </div>
        )}
      </Section>

      <Section title={t('cap.section.leakage')}>
        <NumberField
          label={t('cap.leakageCurrent')}
          value={params.leakageCurrent * 1e6}
          min={0}
          step={0.1}
          onChange={(v) =>
            update(
              {
                leakageCurrent: v * 1e-6,
                leakageResistance: undefined,
                preset: 'custom',
              },
              tag('ileak'),
            )
          }
        />
        <NumberField
          label={t('cap.leakageResistance')}
          value={rLeakMOhm}
          min={0}
          step={0.1}
          onChange={(v) =>
            update({ leakageResistance: v * 1e6, preset: 'custom' }, tag('rleak'))
          }
        />
      </Section>

      <Section title={t('cap.section.ripple')}>
        <NumberField
          label={t('cap.maxRipple')}
          value={params.maxRippleCurrent}
          min={0}
          step={0.01}
          onChange={(v) =>
            update({ maxRippleCurrent: v, preset: 'custom' }, tag('irip'))
          }
        />
        <NumberField
          label={t('cap.rippleFrequency')}
          value={params.rippleFrequency}
          min={0}
          step={10}
          onChange={(v) =>
            update({ rippleFrequency: v, preset: 'custom' }, tag('frip'))
          }
        />
      </Section>

      <Section title={t('cap.section.thermal')}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
          <input
            type="checkbox"
            checked={params.dynamicThermal}
            onChange={(e) => update({ dynamicThermal: e.target.checked }, tag('th'))}
          />
          <span>{t('cap.dynamicThermal')}</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <NumberField
            label={t('cap.ambient')}
            value={params.ambientTemp}
            step={1}
            onChange={(v) => update({ ambientTemp: v, preset: 'custom' }, tag('ta'))}
          />
          <NumberField
            label={t('cap.maxTemp')}
            value={params.maxTemp}
            min={1}
            step={1}
            onChange={(v) => update({ maxTemp: v, preset: 'custom' }, tag('tmax'))}
          />
          <NumberField
            label={t('cap.rth')}
            value={params.thermalResistance}
            min={0.001}
            step={5}
            onChange={(v) =>
              update({ thermalResistance: v, preset: 'custom' }, tag('rth'))
            }
          />
          <NumberField
            label={t('cap.cth')}
            value={params.thermalCapacitance}
            min={0.001}
            step={0.01}
            onChange={(v) =>
              update({ thermalCapacitance: v, preset: 'custom' }, tag('cth'))
            }
          />
        </div>
      </Section>

      <Section title={t('cap.section.advanced')}>
        <Field label={t('cap.integration')}>
          <select
            value={params.integration}
            onChange={(e) =>
              update(
                { capacitorIntegration: e.target.value as typeof params.integration },
                tag('int'),
              )
            }
          >
            <option value="backward-euler">
              {t('cap.integration.backward-euler')}
            </option>
            <option value="trapezoidal">{t('cap.integration.trapezoidal')}</option>
          </select>
        </Field>
        <NumberField
          label={t('cap.dielectricAbsorption')}
          value={params.dielectricAbsorption}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            update({ dielectricAbsorption: v, preset: 'custom' }, tag('da'))
          }
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="insp-action-btn"
            onClick={() => attachProbe('voltage')}
          >
            ＋V <span>{t('cap.probeVoltage')}</span>
          </button>
          <button
            type="button"
            className="insp-action-btn"
            onClick={() => attachProbe('current')}
          >
            ＋A <span>{t('cap.probeCurrent')}</span>
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
          Series bank:{' '}
          {formatValue(
            seriesCapacitance([params.capacitance, params.capacitance]),
            'F',
          )}{' '}
          · Parallel bank:{' '}
          {formatValue(
            parallelCapacitance([params.capacitance, params.capacitance]),
            'F',
          )}
        </div>
      </Section>

      <Section title={t('cap.section.live')}>
        {live ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '4px 10px',
              fontSize: 10.5,
            }}
          >
            {[
              [t('cap.state'), live.stateText],
              [t('inspector.voltage'), fmt(live.terminalVoltage, 3, 'V')],
              [t('inspector.current'), fmt(live.current, 4, 'A')],
              [t('cap.charge'), fmt(live.charge * 1e6, 2, 'µC')],
              [t('cap.energy'), formatValue(live.energy, 'J')],
              [t('inspector.value'), formatValue(params.capacitance, 'F')],
              [t('cap.esr'), fmt(params.esr, 3, 'Ω')],
              [t('cap.esrDrop'), fmt(live.esrVoltage, 4, 'V')],
              [t('cap.esrLoss'), fmt(live.esrLoss, 4, 'W')],
              [t('cap.leakageNow'), fmt(live.leakageCurrent * 1e6, 2, 'µA')],
              [t('cap.rmsCurrent'), fmt(live.rmsCurrent, 4, 'A')],
              [t('cap.peakCurrent'), fmt(live.peakCurrent, 4, 'A')],
              [t('cap.rippleVoltage'), fmt(live.rippleVoltage, 3, 'V')],
              [
                t('cap.rippleFreq'),
                live.rippleFrequency != null
                  ? fmt(live.rippleFrequency, 1, 'Hz')
                  : '—',
              ],
              [t('inspector.power'), fmt(sol?.power ?? 0, 4, 'W')],
              [t('cap.temperature'), fmt(live.temperature, 1, '°C')],
              [t('cap.ratedPct'), `${(live.voltageRatio * 100).toFixed(1)} %`],
              [
                t('cap.reverseVoltage'),
                live.reverseVoltage > 0 ? fmt(live.reverseVoltage, 3, 'V') : '—',
              ],
              [t('cap.severity'), live.reverseSeverity.toUpperCase()],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'grid', gap: 1 }}>
                <span style={{ color: 'var(--text-faint)', fontSize: 9.5 }}>{k}</span>
                <b style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{v}</b>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
            {t('empty.measurementsHint')}
          </div>
        )}
      </Section>

      <Section title={t('cap.section.learn')}>
        {TOPICS.map((topic) => (
          <details key={topic} style={{ fontSize: 10.5 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              {t(`cap.edu.${topic}`)}
            </summary>
            <p style={{ margin: '4px 0 0', lineHeight: 1.6, color: 'var(--text-muted)' }}>
              {CAPACITOR_EXPLANATIONS[locale][topic]}
            </p>
          </details>
        ))}
      </Section>
    </div>
  );
}
