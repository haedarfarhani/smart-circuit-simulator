/**
 * Inspector sections for digital components: logic family, implicit supply,
 * propagation delay, configuration (width, modes, edges, polarity) and live
 * logic telemetry. Follows the same Field/store.updateComponents patterns
 * as the per-type blocks in Inspector.tsx.
 */

import type { CircuitComponent } from '../../models/circuit';
import { useCircuitStore } from '../../store/circuitStore';
import { useSimulationStore } from '../../store/simulationStore';
import { LOGIC_FAMILY_IDS, getFamilySpec } from '../../core/digital/families';
import {
  isGateType,
  resolveDigitalCompParams,
  type CounterMode,
  type ShiftMode,
} from '../../core/digital/types';
import { ALU_OPS } from '../../core/digital/devices';
import type { LogicValue } from '../../core/digital/logic';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const STATE_COLOR: Record<LogicValue, string> = {
  '0': 'var(--text-faint)',
  '1': 'var(--status-success, #22c55e)',
  X: 'var(--status-warning, #f59e0b)',
  Z: 'var(--status-signal, #a855f7)',
};

export function DigitalInspector({ comp }: { comp: CircuitComponent }) {
  const store = useCircuitStore();
  const params = resolveDigitalCompParams(comp);
  const spec = getFamilySpec(params.family);
  const update = (patch: Partial<CircuitComponent>) =>
    store.updateComponents([comp.id], patch);

  const snapshotComp = useSimulationStore(
    (s) => s.snapshot?.componentData.get(comp.id) ?? s.solverResult?.componentData.get(comp.id),
  );
  const digital = snapshotComp?.digital;

  const hasWidth = [
    'adder',
    'subtractor',
    'comparator',
    'alu',
    'register',
    'shift-register',
    'counter',
  ].includes(comp.type);
  const hasInputCount =
    (isGateType(comp.type) && comp.type !== 'not-gate' && comp.type !== 'buffer-gate') ||
    ['multiplexer', 'demultiplexer', 'decoder', 'encoder'].includes(comp.type);

  return (
    <div className="digital-inspector">
      {/* ---- Live logic telemetry ---- */}
      {digital && (
        <div className="digital-telemetry">
          <div className="ac-peak-readout">
            <span>Family</span>
            <b>{digital.family}</b>
          </div>
          <div className="ac-peak-readout">
            <span>VCC (implicit)</span>
            <b>{digital.vcc.toFixed(2)} V</b>
          </div>
          {digital.power > 0 && (
            <div className="ac-peak-readout">
              <span>Supply power (est.)</span>
              <b>
                {digital.power < 1e-3
                  ? `${(digital.power * 1e6).toFixed(0)} µW`
                  : `${(digital.power * 1e3).toFixed(2)} mW`}
              </b>
            </div>
          )}
          {digital.fanout !== undefined && (
            <div className="ac-peak-readout">
              <span>Fan-out</span>
              <b data-over={digital.fanout > spec.fanout}>
                {digital.fanout} / max {spec.fanout}
              </b>
            </div>
          )}
          {digital.outputs.length > 0 && (
            <div className="digital-states-row">
              {digital.outputNames.map((n, i) => (
                <span key={n} className="digital-state-chip" title={`V = ${(digital.outVolts[i] ?? 0).toFixed(2)} V`}>
                  <b style={{ color: STATE_COLOR[digital.outputs[i]] }}>{digital.outputs[i]}</b>
                  {n}
                </span>
              ))}
            </div>
          )}
          {digital.inputs.length > 0 && digital.inputs.length <= 12 && (
            <div className="digital-states-row">
              {digital.inputNames.map((n, i) => (
                <span key={n} className="digital-state-chip muted">
                  <b style={{ color: STATE_COLOR[digital.inputs[i]] }}>{digital.inputs[i]}</b>
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Logic family + implicit supply ---- */}
      <Field label="Logic family">
        <Select
          value={params.family}
          onChange={(v) => update({ logicFamily: v })}
          options={LOGIC_FAMILY_IDS.map((id) => ({
            value: id,
            label: getFamilySpec(id).label,
          }))}
        />
      </Field>
      <Field
        label={`Supply VCC (V, ${spec.vccMin}–${spec.vccMax})`}
      >
        <input
          type="number"
          step="0.5"
          min={spec.vccMin}
          max={spec.vccMax}
          value={comp.vcc ?? spec.vccNominal}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v) && v > 0) update({ vcc: v });
          }}
        />
      </Field>
      <Field label="Propagation delay (ns)">
        <input
          type="number"
          step="1"
          min="0"
          value={comp.tpd ? (comp.tpd * 1e9).toFixed(0) : ''}
          placeholder={`${(spec.tpd * 1e9).toFixed(0)} (family)`}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            update({ tpd: Number.isFinite(v) && v > 0 ? v * 1e-9 : 0 });
          }}
        />
      </Field>

      {/* ---- Configuration ---- */}
      {hasInputCount && (
        <Field label={comp.type === 'decoder' ? 'Select lines' : comp.type === 'encoder' ? 'Data inputs' : 'Inputs / data lines'}>
          <Select
            value={String(params.inputCount)}
            onChange={(v) => update({ inputCount: parseInt(v, 10) })}
            options={
              comp.type === 'decoder'
                ? [2, 3, 4].map((n) => ({ value: String(n), label: `${n} → ${1 << n}` }))
                : comp.type === 'encoder'
                  ? [4, 8, 16].map((n) => ({ value: String(n), label: `${n} → ${Math.log2(n)}` }))
                  : ['multiplexer', 'demultiplexer'].includes(comp.type)
                    ? [2, 4, 8, 16].map((n) => ({ value: String(n), label: `${n === 2 ? '2:1' : `${n}:1`}` }))
                    : [2, 3, 4].map((n) => ({ value: String(n), label: `${n} inputs` }))
            }
          />
        </Field>
      )}
      {hasWidth && (
        <Field label="Bit width">
          <Select
            value={String(params.width)}
            onChange={(v) => update({ width: parseInt(v, 10) })}
            options={[1, 2, 4, 8, 16].map((n) => ({ value: String(n), label: `${n}-bit` }))}
          />
        </Field>
      )}
      {comp.type === 'counter' && (
        <Field label="Counter mode">
          <Select
            value={params.counterMode}
            onChange={(v) => update({ counterMode: v as CounterMode })}
            options={[
              { value: 'up', label: 'Up (binary)' },
              { value: 'down', label: 'Down (binary)' },
              { value: 'updown', label: 'Up/Down' },
              { value: 'ring', label: 'Ring' },
              { value: 'johnson', label: 'Johnson' },
            ]}
          />
        </Field>
      )}
      {comp.type === 'shift-register' && (
        <>
          <Field label="Shift mode">
            <Select
              value={params.shiftMode}
              onChange={(v) => update({ shiftMode: v as ShiftMode })}
              options={[
                { value: 'siso', label: 'Serial in → Serial out' },
                { value: 'sipo', label: 'Serial in → Parallel out' },
                { value: 'piso', label: 'Parallel in → Serial out' },
                { value: 'pipo', label: 'Parallel in → Parallel out' },
              ]}
            />
          </Field>
          <Field label="Shift direction">
            <Select
              value={params.shiftDirection}
              onChange={(v) => update({ shiftDirection: v as 'right' | 'left' })}
              options={[
                { value: 'right', label: 'Right (Q0 → QN)' },
                { value: 'left', label: 'Left (QN → Q0)' },
              ]}
            />
          </Field>
        </>
      )}
      {['d-flip-flop', 'jk-flip-flop', 't-flip-flop', 'sr-flip-flop', 'register', 'shift-register', 'counter'].includes(
        comp.type,
      ) && (
        <Field label="Clock edge">
          <Select
            value={params.edge}
            onChange={(v) => update({ edge: v as 'rising' | 'falling' })}
            options={[
              { value: 'rising', label: 'Rising (↑)' },
              { value: 'falling', label: 'Falling (↓)' },
            ]}
          />
        </Field>
      )}
      {['sr-latch', 'decoder', 'register', 'shift-register', 'counter', 'd-flip-flop', 'jk-flip-flop', 't-flip-flop', 'sr-flip-flop'].includes(
        comp.type,
      ) && (
        <label className="digital-check">
          <input
            type="checkbox"
            checked={params.activeLow}
            onChange={(e) => update({ activeLow: e.target.checked })}
          />
          {comp.type === 'sr-latch'
            ? 'Active-LOW inputs (NAND latch)'
            : comp.type === 'decoder'
              ? 'Active-LOW outputs'
              : 'Active-LOW controls (CLR / LOAD)'}
        </label>
      )}
      {comp.type === 'encoder' && (
        <label className="digital-check">
          <input
            type="checkbox"
            checked={params.priority}
            onChange={(e) => update({ priority: e.target.checked })}
          />
          Priority encoder (highest index wins)
        </label>
      )}
      {['comparator', 'alu', 'adder', 'subtractor'].includes(comp.type) && (
        <label className="digital-check">
          <input
            type="checkbox"
            checked={params.signed}
            onChange={(e) => update({ signed: e.target.checked })}
          />
          Signed (two's complement)
        </label>
      )}
      {comp.type === 'bcd-to-seven-segment-decoder' && (
        <>
          <Field label="Output polarity">
            <Select
              value={params.commonType}
              onChange={(v) =>
                update({ commonType: v as CircuitComponent['commonType'] })
              }
              options={[
                { value: 'common-cathode', label: 'Active-HIGH (common cathode)' },
                { value: 'common-anode', label: 'Active-LOW (common anode)' },
              ]}
            />
          </Field>
          <label className="digital-check">
            <input
              type="checkbox"
              checked={params.hexMode}
              onChange={(e) => update({ hexMode: e.target.checked })}
            />
            Hexadecimal mode (0–F)
          </label>
        </>
      )}
      {comp.type === 'seven-segment-display' && (
        <Field label="Common terminal">
          <Select
            value={params.commonType}
            onChange={(v) =>
              update({ commonType: v as CircuitComponent['commonType'] })
            }
            options={[
              { value: 'common-cathode', label: 'Common cathode (segments HIGH = on)' },
              { value: 'common-anode', label: 'Common anode (segments LOW = on)' },
            ]}
          />
        </Field>
      )}
      {comp.type === 'clock-generator' && (
        <>
          <Field label="Frequency (Hz)">
            <input
              type="number"
              step="any"
              min="0.1"
              value={comp.frequency ?? 10}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) update({ frequency: v });
              }}
            />
          </Field>
          <Field label="Duty cycle (%)">
            <input
              type="number"
              step="1"
              min="1"
              max="99"
              value={comp.dutyCycle ?? 50}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) update({ dutyCycle: Math.min(99, Math.max(1, v)) });
              }}
            />
          </Field>
          <Field label="Initial phase (°)">
            <input
              type="number"
              step="15"
              value={comp.phaseDeg ?? 0}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) update({ phaseDeg: ((v % 360) + 360) % 360 });
              }}
            />
          </Field>
          <label className="digital-check">
            <input
              type="checkbox"
              checked={params.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            Running (uncheck to pause output)
          </label>
        </>
      )}
      {comp.type === 'logic-input' && (
        <div className="switch-toggle-row">
          <button
            type="button"
            className={`switch-segment ${comp.value !== 1 ? 'active' : ''}`}
            onClick={() => update({ value: 0 })}
          >
            ○ LOW (0)
          </button>
          <button
            type="button"
            className={`switch-segment ${comp.value === 1 ? 'active' : ''}`}
            onClick={() => update({ value: 1 })}
          >
            ● HIGH (1)
          </button>
        </div>
      )}
      {comp.type === 'alu' && (
        <div className="digital-op-table">
          <span className="digital-op-table-title">OP3..OP0 → operation</span>
          <div className="digital-op-grid">
            {ALU_OPS.map((op, i) => (
              <span key={op}>
                {i.toString(2).padStart(4, '0')} {op}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
