/**
 * Oscilloscope probe model.
 *
 * A channel is a physical measurement point on the circuit:
 *   - voltage channels measure V(+node) − V(−node)
 *   - current channels measure the solver current of one
 *     branch (a component or a wire)
 *
 * Every value is computed FROM the simulation snapshot — the
 * oscilloscope never generates its own data.
 */

import type { Point } from './circuit';

export type ProbeType = 'voltage' | 'current';
export type ChannelId = 'CH1' | 'CH2' | 'CH3' | 'CH4';
export type Coupling = 'dc' | 'ac';
export type TriggerMode = 'auto' | 'normal' | 'single';
export type TriggerEdge = 'rising' | 'falling';

export const CHANNEL_IDS: ChannelId[] = ['CH1', 'CH2', 'CH3', 'CH4'];

/** Distinct channel identities — never color alone, the CHn label
 * is always rendered next to the trace. */
export const CHANNEL_COLORS: Record<ChannelId, string> = {
  CH1: '#38bdf8', // blue
  CH2: '#f43f5e', // red
  CH3: '#22c55e', // green
  CH4: '#eab308', // amber
};

export interface OscilloscopeChannel {
  id: ChannelId;
  enabled: boolean;
  type: ProbeType;
  /** topology node ids of the two measurement points */
  positiveNodeId: string | null;
  negativeNodeId: string | null;
  /** when true the negative side is the circuit ground node */
  useGroundRef: boolean;
  /** exact click positions (world units) so the markers stay
   * where the user put them */
  positivePoint: Point | null;
  negativePoint: Point | null;
  /** current channels: the measured branch */
  branchId: string | null;
  branchKind: 'component' | 'wire' | null;
  /** user-facing name, e.g. "R1 → GND" */
  label: string;
  color: string;
  /** V/div or A/div. 0 = auto-scale from the samples. */
  scale: number;
  /** vertical position in divisions (positive = up) */
  position: number;
  coupling: Coupling;
  /** drag offset of the on-canvas label card (world units) */
  labelOffset: Point;
}

export interface TriggerSettings {
  source: ChannelId;
  mode: TriggerMode;
  edge: TriggerEdge;
  /** trigger level, in the source channel's units */
  level: number;
}

/** Time per division options, in seconds. */
export const TIME_DIV_OPTIONS: number[] = [
  1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4,
  1e-3, 2e-3, 5e-3, 10e-3, 20e-3, 50e-3, 0.1, 0.2, 0.5, 1, 2, 5,
];

/**
 * Step the time base to the next/previous preset.
 * `dir > 0` selects a LARGER time/div (slower sweep),
 * `dir < 0` a smaller one. Values outside the preset list
 * snap to the nearest entry first.
 */
export function stepTimeDiv(current: number, dir: 1 | -1): number {
  const n = TIME_DIV_OPTIONS.length;
  let idx = TIME_DIV_OPTIONS.indexOf(current);
  if (idx === -1) {
    idx = 0;
    for (let i = 1; i < n; i++) {
      if (
        Math.abs(TIME_DIV_OPTIONS[i] - current) <
        Math.abs(TIME_DIV_OPTIONS[idx] - current)
      ) {
        idx = i;
      }
    }
  }
  return TIME_DIV_OPTIONS[Math.min(n - 1, Math.max(0, idx + dir))];
}

/** V/div options. */
export const VOLTAGE_DIV_OPTIONS: number[] = [
  0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50,
];

/** A/div options. */
export const CURRENT_DIV_OPTIONS: number[] = [
  1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4,
  1e-3, 2e-3, 5e-3, 10e-3, 20e-3, 50e-3, 0.1, 0.2, 0.5, 1,
];

/** Rolling history per channel. */
export interface ChannelSample {
  t: number;
  value: number;
}

export const MAX_CHANNEL_SAMPLES = 5000;

export function makeChannel(id: ChannelId): OscilloscopeChannel {
  return {
    id,
    enabled: true,
    type: 'voltage',
    positiveNodeId: null,
    negativeNodeId: null,
    useGroundRef: true,
    positivePoint: null,
    negativePoint: null,
    branchId: null,
    branchKind: null,
    label: id,
    color: CHANNEL_COLORS[id],
    scale: 0,
    position: 0,
    coupling: 'dc',
    labelOffset: { x: 0, y: 0 },
  };
}

/**
 * The instantaneous measurement of one channel, read straight
 * from a simulation snapshot. Never computed independently of
 * the solver state.
 */
export function channelValue(
  channel: OscilloscopeChannel,
  snap: {
    nodeVoltages: Map<string, number>;
    componentData: Map<string, { current: number }>;
    wireCurrents: Map<string, number>;
  },
): number {
  if (channel.type === 'voltage') {
    const vPlus =
      channel.positiveNodeId != null
        ? (snap.nodeVoltages.get(channel.positiveNodeId) ?? 0)
        : 0;
    const vMinus = channel.useGroundRef
      ? 0 // ground node is always 0 V by construction
      : channel.negativeNodeId != null
        ? (snap.nodeVoltages.get(channel.negativeNodeId) ?? 0)
        : 0;
    return vPlus - vMinus;
  }
  if (channel.branchId == null) return 0;
  if (channel.branchKind === 'wire') {
    return snap.wireCurrents.get(channel.branchId) ?? 0;
  }
  return snap.componentData.get(channel.branchId)?.current ?? 0;
}

export interface MeasurementStats {
  count: number;
  max: number;
  min: number;
  avg: number;
  rms: number;
  pp: number;
  /** estimated fundamental frequency in Hz, null when unknown */
  frequency: number | null;
}

/** Statistics of a real sample window — never synthetic. */
export function computeStats(
  samples: readonly { t: number; value: number }[],
): MeasurementStats {
  const n = samples.length;
  if (n === 0) {
    return { count: 0, max: 0, min: 0, avg: 0, rms: 0, pp: 0, frequency: null };
  }
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  let sumSq = 0;
  for (const s of samples) {
    if (s.value > max) max = s.value;
    if (s.value < min) min = s.value;
    sum += s.value;
    sumSq += s.value * s.value;
  }
  const avg = sum / n;
  const rms = Math.sqrt(sumSq / n);

  // Frequency: average the intervals between consecutive rising
  // crossings of the mean level (linearly interpolated for
  // sub-sample accuracy). Averaging PERIODS — not crossings/span —
  // keeps the estimate correct even when the buffer holds a
  // non-integer number of cycles (e.g. 5 cycles in 0.099 s must
  // still read 50 Hz, not 4/0.099 ≈ 40 Hz).
  const crossings: number[] = [];
  let prevAbove = samples[0].value >= avg;
  for (let i = 1; i < n; i++) {
    const above = samples[i].value >= avg;
    if (above && !prevAbove) {
      const v0 = samples[i - 1].value;
      const v1 = samples[i].value;
      const t0 = samples[i - 1].t;
      const t1 = samples[i].t;
      const f = v1 === v0 ? 0 : (avg - v0) / (v1 - v0);
      const tc = t0 + f * (t1 - t0);
      if (Number.isFinite(tc)) crossings.push(tc);
    }
    prevAbove = above;
  }
  let frequency: number | null = null;
  if (crossings.length >= 2) {
    let sumPeriods = 0;
    for (let i = 1; i < crossings.length; i++) {
      sumPeriods += crossings[i] - crossings[i - 1];
    }
    const meanPeriod = sumPeriods / (crossings.length - 1);
    if (meanPeriod > 0 && Number.isFinite(meanPeriod)) {
      frequency = 1 / meanPeriod;
    }
  }

  return {
    count: n,
    max,
    min,
    avg,
    rms,
    pp: max - min,
    frequency: frequency != null && Number.isFinite(frequency) ? frequency : null,
  };
}

/**
 * Find the most recent trigger point: the last time the source
 * channel crossed `level` in the requested direction. Scanning
 * backwards keeps the display stable for periodic waveforms.
 */
export function findTriggerTime(
  samples: readonly { t: number; value: number }[],
  level: number,
  edge: TriggerEdge,
): number | null {
  if (samples.length < 2) return null;
  for (let i = samples.length - 1; i > 0; i--) {
    const prev = samples[i - 1].value;
    const cur = samples[i].value;
    if (edge === 'rising' && prev < level && cur >= level) {
      return samples[i].t;
    }
    if (edge === 'falling' && prev > level && cur <= level) {
      return samples[i].t;
    }
  }
  return null;
}

/**
 * Validity of a channel's measurement target against the CURRENT
 * circuit. Node ids and branch ids go stale when the user edits
 * the circuit after placing a probe — such a channel silently
 * measures 0 (a flat line that looks like "no waveform").
 *
 * Returns:
 *   - 'ok': target resolves, samples are real measurements
 *   - 'no-source': no probe ever attached to this channel
 *   - 'stale': a probe was attached, but its node/branch no
 *     longer exists — the user must re-place the probe
 */
export type ChannelTargetState = 'ok' | 'no-source' | 'stale';

export function channelTargetState(
  channel: OscilloscopeChannel,
  topology: { nodes: Map<string, unknown> } | null,
  doc: {
    components: { id: string }[];
    wires: { id: string }[];
  },
): ChannelTargetState {
  if (channel.type === 'voltage') {
    if (channel.positiveNodeId == null) return 'no-source';
    if (!topology) return 'stale';
    if (!topology.nodes.has(channel.positiveNodeId)) return 'stale';
    if (!channel.useGroundRef) {
      if (channel.negativeNodeId == null) return 'no-source';
      if (!topology.nodes.has(channel.negativeNodeId)) return 'stale';
    }
    return 'ok';
  }
  if (channel.branchId == null) return 'no-source';
  if (channel.branchKind === 'wire') {
    return doc.wires.some((w) => w.id === channel.branchId) ? 'ok' : 'stale';
  }
  return doc.components.some((c) => c.id === channel.branchId) ? 'ok' : 'stale';
}

/** Human label for a channel describing exactly what it measures. */
export function channelDescription(
  channel: OscilloscopeChannel,
  doc: { components: { id: string; label: string }[]; wires: { id: string }[] },
  groundNode: string,
  nodeLabel: (nodeId: string) => string,
): string {
  if (channel.type === 'voltage') {
    const plus =
      channel.positiveNodeId != null
        ? nodeLabel(channel.positiveNodeId)
        : '?';
    const minus = channel.useGroundRef
      ? groundNode
      : channel.negativeNodeId != null
        ? nodeLabel(channel.negativeNodeId)
        : '?';
    return `${plus} → ${minus}`;
  }
  if (channel.branchId == null) return '?';
  if (channel.branchKind === 'wire') {
    return doc.wires.some((w) => w.id === channel.branchId)
      ? `wire ${channel.branchId.slice(-4)}`
      : '?';
  }
  const comp = doc.components.find((c) => c.id === channel.branchId);
  return comp ? comp.label : '?';
}
