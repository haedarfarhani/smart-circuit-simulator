import type { ReactNode } from 'react';
import type { CircuitComponent } from '../../models/circuit';
import type { ComponentSolution } from '../../core/solver';
import {
  BJT_PRESETS,
  applyBjtPreset,
  getBjtParameters,
  type BjtRegion,
  type BjtThermalState,
  type BjtType,
} from '../../core/bjtModel';
import { useProbeStore } from '../../store/probeStore';
import { useSimulationStore } from '../../store/simulationStore';
import { useUiStore } from '../../store/uiStore';
import { BjtAnalyzer } from '../panels/BjtAnalyzer';

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

function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details
      className="bjt-section"
      open={open}
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
          if (Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max)) {
            onChange(v);
          }
        }}
      />
    </Field>
  );
}

const fmt = (v: number | undefined | null, digits = 3, unit = ''): string => {
  if (v == null || !Number.isFinite(v)) return `—${unit ? ` ${unit}` : ''}`;
  return `${v.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
};

/** Format a current with an SI prefix so µA and mA are both readable. */
const fmtCurrent = (v: number | undefined | null): string => {
  if (v == null || !Number.isFinite(v)) return '— A';
  const a = Math.abs(v);
  if (a >= 1) return `${v.toFixed(3)} A`;
  if (a >= 1e-3) return `${(v * 1e3).toFixed(3)} mA`;
  if (a >= 1e-6) return `${(v * 1e6).toFixed(2)} µA`;
  if (a >= 1e-9) return `${(v * 1e9).toFixed(2)} nA`;
  return `${v.toExponential(2)} A`;
};

const REGION_TONE: Record<BjtRegion, string> = {
  cutoff: 'var(--text-muted)',
  'forward-active': 'var(--ok)',
  saturation: 'var(--warn)',
  'reverse-active': '#a78bfa',
  breakdown: 'var(--danger)',
};

const THERMAL_TONE: Record<BjtThermalState, string> = {
  normal: 'var(--ok)',
  warm: 'var(--warn)',
  high: 'var(--warn)',
  critical: 'var(--danger)',
};

/**
 * Complete BJT inspector. Every live number is read from the simulation
 * snapshot's `bjt` payload (the solver's operating point), never recomputed
 * here with different assumptions.
 */
export function BjtInspector({ comp, sol, update, t }: Props) {
  const params = getBjtParameters(comp);
  const live = sol?.bjt;
  const tj = live?.tj ?? sol?.junctionTemp ?? params.tAmbient;
  const topology = useSimulationStore((s) => s.topology);

  const type: BjtType = params.transistorType;

  const tag = (name: string) => `bjt:${name}:${comp.id}`;

  const pickChannel = () => {
    const channels = useProbeStore.getState().channels;
    return (
      channels.find((c) => c.positiveNodeId == null && c.negativeNodeId == null && c.branchId == null) ??
      channels[0]
    );
  };

  const openScope = () => {
    const ui = useUiStore.getState();
    ui.setBottomPanelTab('oscilloscope');
    ui.setSimulationEnabled(true);
  };

  const attachVoltage = (pair: 'vbe' | 'vce' | 'vb' | 'vc' | 've') => {
    const ch = pickChannel();
    if (!ch) return;
    const topo = topology?.components.find((c) => c.id === comp.id);
    if (!topo?.nodeA) return;
    const nodeB = topo.nodeB;
    const nodeE = topo.nodeC;
    let positive = topo.nodeA;
    let negative = nodeE ?? null;
    let ground = false;
    if (pair === 'vce') {
      positive = nodeB ?? topo.nodeA;
      negative = nodeE ?? null;
    } else if (pair === 'vb') {
      negative = null;
      ground = true;
    } else if (pair === 'vc') {
      positive = nodeB ?? topo.nodeA;
      negative = null;
      ground = true;
    } else if (pair === 've') {
      positive = nodeE ?? topo.nodeA;
      negative = null;
      ground = true;
    }
    useProbeStore.getState().updateChannel(ch.id, {
      enabled: true,
      type: 'voltage',
      positiveNodeId: positive,
      negativeNodeId: negative,
      useGroundRef: ground,
      branchId: null,
      branchKind: null,
      branchTerminal: null,
      quantity: null,
      positivePoint: { x: comp.x, y: comp.y },
      negativePoint: null,
      label: `${comp.label} ${pair.toUpperCase()}`,
    });
    openScope();
  };

  const attachCurrent = (terminal: 0 | 1 | 2) => {
    const ch = pickChannel();
    if (!ch) return;
    useProbeStore.getState().updateChannel(ch.id, {
      enabled: true,
      type: 'current',
      positiveNodeId: null,
      negativeNodeId: null,
      useGroundRef: false,
      branchId: comp.id,
      branchKind: 'component',
      branchTerminal: terminal,
      quantity: null,
      positivePoint: { x: comp.x, y: comp.y },
      negativePoint: null,
      label: `${comp.label} ${
        terminal === 0 ? t('bjt.base') : terminal === 1 ? t('bjt.collector') : t('bjt.emitter')
      }`,
    });
    openScope();
  };

  const attachQuantity = (quantity: 'power' | 'temperature') => {
    const ch = pickChannel();
    if (!ch) return;
    useProbeStore.getState().updateChannel(ch.id, {
      enabled: true,
      type: 'current',
      positiveNodeId: null,
      negativeNodeId: null,
      useGroundRef: false,
      branchId: comp.id,
      branchKind: 'component',
      branchTerminal: null,
      quantity,
      positivePoint: { x: comp.x, y: comp.y },
      negativePoint: null,
      label: `${comp.label} ${quantity === 'power' ? t('bjt.power') : t('bjt.junctionTemp')}`,
    });
    openScope();
  };

  const warnings: string[] = [];
  if (live?.breakdownWarning) warnings.push(t('bjt.warn.breakdown'));
  if (live?.overload) warnings.push(t('bjt.warn.overload'));
  if (live?.thermalState === 'high' || live?.thermalState === 'critical') {
    warnings.push(t('bjt.warn.thermal'));
  }

  const region = live?.region;
  const explanationKey = region ? `bjt.edu.${region}` : 'bjt.edu.idle';

  return (
    <div className="bjt-inspector" style={{ marginTop: 10 }}>
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
        </div>
      )}

      <div className="bjt-region-row">
        <span
          className="bjt-region-badge"
          style={{ borderColor: region ? REGION_TONE[region] : 'var(--line)', color: region ? REGION_TONE[region] : 'var(--text-muted)' }}
        >
          {region ? t(`bjt.region.${region}`) : t('bjt.region.unknown')}
        </span>
        <span className="bjt-type-tag">
          {type.toUpperCase()} · {params.modelType === 'ebers-moll' ? 'Ebers-Moll' : t('bjt.modelSimplified')}
        </span>
        {live && (
          <span className="bjt-thermal-tag" style={{ color: THERMAL_TONE[live.thermalState] }}>
            {t(`bjt.thermal.${live.thermalState}`)}
          </span>
        )}
      </div>

      {/* Live operating point */}
      <div className="bjt-live-grid">
        <LiveCard label="VBE" value={fmt(live?.vbe, 3, 'V')} tone="v" />
        <LiveCard label="VCE" value={fmt(live?.vce, 3, 'V')} tone="v" />
        <LiveCard label="IB" value={fmtCurrent(live?.ib)} tone="i" />
        <LiveCard label="IC" value={fmtCurrent(live?.ic)} tone="i" />
        <LiveCard label="IE" value={fmtCurrent(live?.ie)} tone="i" />
        <LiveCard
          label="β"
          value={
            live && Number.isFinite(live.beta) && Math.abs(live.ib) > 1e-12
              ? live.beta.toFixed(1)
              : '—'
          }
          tone="g"
        />
        <LiveCard label={t('bjt.power')} value={fmt(live?.power, 4, 'W')} tone="p" />
        <LiveCard label="Tj" value={fmt(tj, 1, '°C')} tone="t" />
      </div>

      {live && (
        <div className="bjt-power-bar-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>{t('bjt.dissipation')}</span>
            <span
              style={{
                fontWeight: 600,
                color:
                  (live.powerRatio ?? 0) > 1
                    ? 'var(--danger)'
                    : (live.powerRatio ?? 0) > 0.8
                      ? 'var(--warn)'
                      : 'var(--ok)',
              }}
            >
              {((live.powerRatio ?? 0) * 100).toFixed(0)}% · {fmt(live.power, 3, 'W')} / {params.pMax} W
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--panel-3)', borderRadius: 3, overflow: 'hidden', marginTop: 3 }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, (live.powerRatio ?? 0) * 100)}%`,
                background:
                  (live.powerRatio ?? 0) > 1
                    ? 'var(--danger)'
                    : (live.powerRatio ?? 0) > 0.8
                      ? 'var(--warn)'
                      : 'var(--accent-2)',
                transition: 'width 0.15s ease',
              }}
            />
          </div>
        </div>
      )}

      <div className="bjt-explain">{t(explanationKey)}</div>

      {/* Probe buttons */}
      <div className="bjt-probe-row">
        <ProbeBtn label="VBE" onClick={() => attachVoltage('vbe')} />
        <ProbeBtn label="VCE" onClick={() => attachVoltage('vce')} />
        <ProbeBtn label="IB" onClick={() => attachCurrent(0)} />
        <ProbeBtn label="IC" onClick={() => attachCurrent(1)} />
        <ProbeBtn label="IE" onClick={() => attachCurrent(2)} />
        <ProbeBtn label={t('bjt.power')} onClick={() => attachQuantity('power')} />
        <ProbeBtn label="Tj" onClick={() => attachQuantity('temperature')} />
      </div>

      <Section title={t('bjt.section.general')}>
        <Field label={t('bjt.type')}>
          <select
            value={type}
            onChange={(e) =>
              update({ transistorType: e.target.value as BjtType, preset: 'custom' }, tag('type'))
            }
          >
            <option value="npn">NPN</option>
            <option value="pnp">PNP</option>
          </select>
        </Field>
        <Field label={t('bjt.preset')}>
          <select
            value={comp.preset && BJT_PRESETS[comp.preset] ? comp.preset : 'custom'}
            onChange={(e) => {
              const key = e.target.value;
              if (key !== 'custom' && BJT_PRESETS[key]) {
                update(applyBjtPreset(key), tag('preset'));
              } else {
                update({ preset: 'custom' }, tag('preset'));
              }
            }}
          >
            {Object.keys(BJT_PRESETS).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
            <option value="custom">{t('bjt.presetCustom')}</option>
          </select>
        </Field>
        <Field label={t('bjt.model')}>
          <select
            value={params.modelType}
            onChange={(e) =>
              update({ modelType: e.target.value as 'simplified' | 'ebers-moll', preset: 'custom' }, tag('model'))
            }
          >
            <option value="ebers-moll">Ebers-Moll</option>
            <option value="simplified">{t('bjt.modelSimplified')}</option>
          </select>
        </Field>
        {params.source && <div className="bjt-source">{params.source}</div>}
      </Section>

      <Section title={t('bjt.section.electrical')}>
        {params.modelType === 'simplified' ? (
          <>
            <NumberField
              label={t('bjt.beta')}
              value={comp.beta ?? params.beta}
              min={1}
              onChange={(v) => update({ beta: v, preset: 'custom' }, tag('beta'))}
            />
            <NumberField
              label={`${t('bjt.vbeOn')} (V)`}
              value={comp.vbe ?? params.vbe}
              step={0.01}
              min={0.1}
              onChange={(v) => update({ vbe: v, preset: 'custom' }, tag('vbe'))}
            />
            <NumberField
              label={`${t('bjt.vceSat')} (V)`}
              value={comp.vceSat ?? params.vceSat}
              step={0.01}
              min={0.01}
              onChange={(v) => update({ vceSat: v, preset: 'custom' }, tag('vcesat'))}
            />
            <NumberField
              label={`${t('bjt.leakage')} (A)`}
              value={comp.isLeak ?? params.isLeak}
              step={1e-9}
              min={0}
              onChange={(v) => update({ isLeak: v, preset: 'custom' }, tag('leak'))}
            />
          </>
        ) : (
          <>
            <NumberField
              label={`IS (A)`}
              value={comp.is ?? params.is}
              step={1e-15}
              min={1e-20}
              onChange={(v) => update({ is: v, preset: 'custom' }, tag('is'))}
            />
            <NumberField
              label="BF (hFE)"
              value={comp.bf ?? params.bf}
              min={1}
              onChange={(v) => update({ bf: v, preset: 'custom' }, tag('bf'))}
            />
            <NumberField
              label="BR"
              value={comp.br ?? params.br}
              min={1}
              onChange={(v) => update({ br: v, preset: 'custom' }, tag('br'))}
            />
            <NumberField
              label="NF"
              value={comp.nf ?? params.nf}
              step={0.01}
              min={0.1}
              onChange={(v) => update({ nf: v, preset: 'custom' }, tag('nf'))}
            />
            <NumberField
              label="NR"
              value={comp.nr ?? params.nr}
              step={0.01}
              min={0.1}
              onChange={(v) => update({ nr: v, preset: 'custom' }, tag('nr'))}
            />
            <NumberField
              label={`VAF (V)`}
              value={comp.vaf ?? params.vaf}
              step={1}
              min={0}
              onChange={(v) => update({ vaf: v, preset: 'custom' }, tag('vaf'))}
            />
            <NumberField
              label={`VAR (V)`}
              value={comp.var_ ?? params.var_}
              step={1}
              min={0}
              onChange={(v) => update({ var_: v, preset: 'custom' }, tag('var'))}
            />
            {live && (
              <div className="bjt-source">
                {t('bjt.forcedBeta')}: {Math.abs(live.ib) > 1e-12 ? live.betaForced.toFixed(1) : '—'}
                {' · '}
                {t('bjt.modelBeta')}: {params.bf.toFixed(0)}
              </div>
            )}
          </>
        )}
      </Section>

      <Section title={t('bjt.section.ratings')} open={false}>
        <NumberField
          label={`${t('bjt.pMax')} (W)`}
          value={comp.pMax ?? params.pMax}
          step={0.05}
          min={0.001}
          onChange={(v) => update({ pMax: v, preset: 'custom' }, tag('pmax'))}
        />
        <NumberField
          label={`VCEO (V)`}
          value={comp.vceo ?? params.vceo}
          min={1}
          onChange={(v) => update({ vceo: v, preset: 'custom' }, tag('vceo'))}
        />
        <NumberField
          label={`VCBO (V)`}
          value={comp.vcbo ?? params.vcbo}
          min={1}
          onChange={(v) => update({ vcbo: v, preset: 'custom' }, tag('vcbo'))}
        />
        <NumberField
          label={`VEBO (V)`}
          value={comp.vebo ?? params.vebo}
          step={0.5}
          min={0.5}
          onChange={(v) => update({ vebo: v, preset: 'custom' }, tag('vebo'))}
        />
        <NumberField
          label={`IC max (A)`}
          value={comp.icMax ?? params.icMax}
          step={0.01}
          min={0.001}
          onChange={(v) => update({ icMax: v, preset: 'custom' }, tag('icmax'))}
        />
      </Section>

      <Section title={t('bjt.section.thermal')} open={false}>
        <NumberField
          label={`${t('bjt.tAmbient')} (°C)`}
          value={comp.tAmbient ?? params.tAmbient}
          min={-40}
          onChange={(v) => update({ tAmbient: v, preset: 'custom' }, tag('tamb'))}
        />
        <NumberField
          label={`Tj max (°C)`}
          value={comp.tMax ?? params.tMax}
          min={30}
          onChange={(v) => update({ tMax: v, preset: 'custom' }, tag('tmax'))}
        />
        <NumberField
          label={`${t('bjt.rth')} (°C/W)`}
          value={comp.rth ?? params.rth}
          step={10}
          min={0.001}
          onChange={(v) => update({ rth: v, preset: 'custom' }, tag('rth'))}
        />
        <NumberField
          label={`${t('bjt.cth')} (J/°C)`}
          value={comp.cth ?? params.cth}
          step={0.1}
          min={0.001}
          onChange={(v) => update({ cth: v, preset: 'custom' }, tag('cth'))}
        />
        <NumberField
          label={`${t('bjt.nominalTemp')} (°C)`}
          value={comp.nominalTemp ?? params.nominalTemp}
          onChange={(v) => update({ nominalTemp: v, preset: 'custom' }, tag('tnom'))}
        />
        <NumberField
          label={t('bjt.betaTempCoeff')}
          value={comp.betaTempCoeff ?? params.betaTempCoeff}
          step={0.1}
          min={0}
          onChange={(v) => update({ betaTempCoeff: v, preset: 'custom' }, tag('betatc'))}
        />
      </Section>

      <Section title={t('bjt.section.analyzer')}>
        <BjtAnalyzer
          params={params}
          tj={tj}
          operatingPoint={
            live
              ? { vbe: live.vbe, vce: live.vce, ib: live.ib, ic: live.ic, region: live.region }
              : null
          }
          t={t}
        />
      </Section>

      <Section title={t('bjt.section.education')} open={false}>
        <Education t={t} />
      </Section>
    </div>
  );
}

function LiveCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`bjt-live-card tone-${tone}`}>
      <span className="bjt-live-k">{label}</span>
      <span className="bjt-live-v">{value}</span>
    </div>
  );
}

function ProbeBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="bjt-probe-btn" onClick={onClick} title={label}>
      ◉ {label}
    </button>
  );
}

const GLOSSARY: { key: string; term: string }[] = [
  { key: 'npn', term: 'NPN' },
  { key: 'pnp', term: 'PNP' },
  { key: 'base', term: 'B' },
  { key: 'collector', term: 'C' },
  { key: 'emitter', term: 'E' },
  { key: 'beta', term: 'β' },
  { key: 'biasing', term: 'BIAS' },
  { key: 'loadLine', term: 'LL' },
  { key: 'thermal', term: 'T' },
];

function Education({ t }: { t: (key: string) => string }) {
  return (
    <div className="bjt-glossary">
      {GLOSSARY.map((g) => (
        <div key={g.key}>
          <b>{g.term}</b>
          <span>{t(`bjt.glossary.${g.key}`)}</span>
        </div>
      ))}
    </div>
  );
}
