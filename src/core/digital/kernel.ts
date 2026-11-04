/**
 * Digital simulation kernel.
 *
 * A deterministic, event-driven logic kernel co-scheduled inside the
 * existing fixed-timestep analog engine. One kernel advance per analog
 * timestep:
 *
 *   1. apply scheduled output events that are due (propagation delays),
 *   2. classify input node voltages against the family thresholds
 *      (0 / 1 / X, with floating nets mapped per family),
 *   3. evaluate every device (pure functions in `devices.ts`) and
 *      schedule output transitions at t + tpd,
 *   4. advance the time-driven clock generators,
 *   5. compute the electrical output voltage of every driven pin
 *      (VOH/VOL targets with linear rise/fall transitions),
 *   6. refresh warnings and switching-activity power estimates.
 *
 * Every output carries at least one timestep of delay, which makes
 * zero-delay feedback loops impossible: a gate feeding itself oscillates
 * at a rate the event-storm guard can observe and report instead of
 * hanging the solver.
 *
 * KNOWN APPROXIMATIONS (documented, deliberate):
 *   - Propagation delays quantize to the analog timestep dt; sub-dt
 *     delays become one step.
 *   - Rise/fall transitions are linear ramps of the stamped Norton
 *     voltage, not RC curves.
 *   - Metastability after a setup/hold violation is a bounded X window,
 *     not a physical model.
 *   - Dynamic power is the textbook α·C·V²·f estimate from tracked
 *     switching activity.
 */

import type { CircuitDoc, CircuitComponent } from '../../models/circuit';
import type { CircuitTopology } from '../solver';
import {
  devicePins,
  getDeviceDef,
  type DeviceEvalCtx,
  type DeviceEvalResult,
  type DevicePinDef,
  type DeviceState,
} from './devices';
import {
  estimateLoadCapacitance,
  resolveDigitalParams,
  type ResolvedDigitalParams,
} from './families';
import type { LogicValue } from './logic';
import { resolveDrivers } from './logic';
import { countDigitalFanout } from './stamping';
import { isDigitalDeviceType, isSevenSegmentType, resolveDigitalCompParams, type DigitalCompParams } from './types';

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export interface DigitalEvent {
  /** sim time when the output changes (already quantized) */
  time: number;
  compId: string;
  /** output pin index (within the device's ordered outputs) */
  pin: number;
  value: LogicValue;
}

export interface DeviceRuntime {
  /** logic state per output pin */
  outputs: LogicValue[];
  /** electrical volts at the start of the current transition */
  fromVolts: number[];
  /** transition start time per output (-1 = settled) */
  transStart: number[];
  /** transition duration per output (rise or fall) */
  transDur: number[];
  /** current electrical volts per output (what gets stamped) */
  outVolts: number[];
  /** classified input values per input pin (telemetry + input loading) */
  inputs: LogicValue[];
  /** device-internal state (Q bits, counter value, edge timestamps…) */
  state: DeviceState;
  /** outputs are X until this sim time (metastability approximation) */
  metastableUntil: number;
  /** switching-activity estimate: transitions per second (per device) */
  switchRate: number;
  actCount: number;
  actWindowStart: number;
}

export interface DigitalSimState {
  runtimes: Map<string, DeviceRuntime>;
  pending: DigitalEvent[];
  /** last classified change time per input pin, keyed `${compId}` */
  inputChangedAt: Map<string, number[]>;
  prevInputs: Map<string, LogicValue[]>;
  /** seven-segment conduction state per segment (electrical display) */
  sevenSeg: Map<string, boolean[]>;
  /** latched when the event queue overflows (oscillation guard) */
  storm: boolean;
  /** warnings currently active, recomputed every step */
  activeWarnings: string[];
  /** driver-analysis cache, invalidated when the doc object changes */
  drivenDoc: CircuitDoc | null;
  driven: Set<string>;
  contention: Map<string, boolean>;
}

export const MAX_PENDING_EVENTS = 2048;
/** Sustained switching above this rate suggests an oscillating loop. */
const OSCILLATION_RATE = 500;

export function createDigitalSimState(): DigitalSimState {
  return {
    runtimes: new Map(),
    pending: [],
    inputChangedAt: new Map(),
    prevInputs: new Map(),
    sevenSeg: new Map(),
    storm: false,
    activeWarnings: [],
    drivenDoc: null,
    driven: new Set(),
    contention: new Map(),
  };
}

/** Fresh runtime for one device: reset state, outputs low. */
function freshRuntime(type: Parameters<typeof getDeviceDef>[0], docComp: CircuitComponent): DeviceRuntime {
  const params = resolveDigitalCompParams(docComp);
  const def = getDeviceDef(type);
  const pins = def ? def.pins(params) : [];
  const outs = pins.filter((p) => p.dir === 'out');
  const state = def?.initialState?.(params) ?? {};
  return {
    outputs: outs.map(() => '0'),
    fromVolts: outs.map(() => 0),
    transStart: outs.map(() => -1),
    transDur: outs.map(() => 0),
    outVolts: outs.map(() => 0),
    inputs: pins.filter((p) => p.dir === 'in').map(() => 'Z'),
    state,
    metastableUntil: 0,
    switchRate: 0,
    actCount: 0,
    actWindowStart: 0,
  };
}

/**
 * (Re)initialize runtimes for all digital devices in the doc, keeping any
 * existing runtime state for components that persist across the call.
 * Called when a simulation starts/stops and whenever a device appears.
 */
export function ensureRuntimes(doc: CircuitDoc, sim: DigitalSimState): void {
  const seen = new Set<string>();
  for (const comp of doc.components) {
    if (!isDigitalDeviceType(comp.type)) continue;
    seen.add(comp.id);
    if (!sim.runtimes.has(comp.id)) {
      sim.runtimes.set(comp.id, freshRuntime(comp.type, comp));
    }
    if (!sim.sevenSeg.has(comp.id) && isSevenSegmentType(comp.type)) {
      sim.sevenSeg.set(comp.id, new Array(8).fill(false));
    }
  }
  for (const id of [...sim.runtimes.keys()]) {
    if (!seen.has(id)) sim.runtimes.delete(id);
  }
  for (const id of [...sim.sevenSeg.keys()]) {
    const comp = doc.components.find((c) => c.id === id);
    if (!comp || !isSevenSegmentType(comp.type)) sim.sevenSeg.delete(id);
  }
  sim.drivenDoc = null; // invalidate driver cache
}

/** Clear all sequential state back to the reset values (Stop / Reset). */
export function resetDigitalState(doc: CircuitDoc, sim: DigitalSimState): void {
  sim.runtimes.clear();
  sim.pending = [];
  sim.inputChangedAt.clear();
  sim.prevInputs.clear();
  sim.storm = false;
  sim.activeWarnings = [];
  ensureRuntimes(doc, sim);
}

// ---------------------------------------------------------------------------
// Driver analysis (which nodes are actually driven)
// ---------------------------------------------------------------------------

const BRIDGE_TYPES = new Set([
  'resistor',
  'lamp',
  'switch',
  'dcMotor',
  'solenoid',
  'acMotor',
  'diode',
  'led',
]);

/**
 * Determine which topology nodes are electrically driven: sources, ground,
 * active digital outputs, and anything reachable from those through
 * resistive bridges (a resistor divider output IS driven; a dangling wire
 * is not). Capacitors are not bridges — they block DC.
 */
function refreshDriverAnalysis(doc: CircuitDoc, topology: CircuitTopology, sim: DigitalSimState): void {
  if (sim.drivenDoc === doc) return;
  sim.drivenDoc = doc;
  sim.driven = new Set();
  sim.contention = new Map();
  /** digital driver values per bridge-group root, for contention resolution */
  const driverValues = new Map<string, LogicValue[]>();

  const nodeOfTerminal = new Map<string, string>();
  for (const info of topology.components) {
    const nodes = info.nodes ?? [info.nodeA, info.nodeB, info.nodeC ?? ''];
    nodes.forEach((n, i) => {
      if (n) nodeOfTerminal.set(`${info.id}:${i}`, n);
    });
  }
  for (const comp of doc.components) {
    if (comp.type === 'ground') {
      const n = nodeOfTerminal.get(`${comp.id}:0`);
      if (n) sim.driven.add(n);
    }
  }

  // Bridges: union-find over nodes joined by resistive elements.
  const parent = new Map<string, string>();
  const find = (n: string): string => {
    const p = parent.get(n);
    if (!p || p === n) return n;
    const r = find(p);
    parent.set(n, r);
    return r;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const info of topology.components) {
    if (!BRIDGE_TYPES.has(info.type)) continue;
    const nodes = info.nodes ?? [info.nodeA, info.nodeB];
    const a = nodes[0];
    const b = nodes[1];
    if (a && b) {
      find(a);
      find(b);
      union(a, b);
    }
  }

  // Seed driven roots.
  for (const comp of doc.components) {
    if (comp.type === 'battery' || comp.type === 'acVoltageSource' || comp.type === 'currentSource') {
      const info = topology.components.find((c) => c.id === comp.id);
      const nodes = info?.nodes ?? [info?.nodeA, info?.nodeB];
      for (const n of nodes) {
        if (n) {
          sim.driven.add(find(n));
        }
      }
    }
  }
  for (const info of topology.components) {
    if (!isDigitalDeviceType(info.type)) continue;
    const comp = doc.components.find((c) => c.id === info.id);
    if (!comp) continue;
    const params = resolveDigitalCompParams(comp);
    const pins = devicePins(info.type, params);
    const runtime = sim.runtimes.get(info.id);
    const nodes = info.nodes ?? [];
    let outIdx = 0;
    pins.forEach((pin, fullIdx) => {
      if (pin.dir !== 'out') return;
      const value = runtime ? runtime.outputs[outIdx] : '0';
      outIdx++;
      const n = nodes[fullIdx];
      if (!n || value === 'Z') return;
      const root = find(n);
      sim.driven.add(root);
      const list = driverValues.get(root) ?? [];
      list.push(value);
      driverValues.set(root, list);
    });
  }

  // Propagate drivenness through bridge groups.
  const drivenRoots = new Set([...sim.driven].map(find));
  for (const key of parent.keys()) {
    if (drivenRoots.has(find(key))) sim.driven.add(key);
  }
  for (const n of [...sim.driven]) sim.driven.add(find(n));

  // Resolve contention per root group.
  const resolved = new Map<string, boolean>();
  for (const [n, values] of driverValues) {
    const root = find(n);
    const { contention } = resolveDrivers(values);
    resolved.set(root, resolved.get(root) || contention);
  }
  sim.contention = resolved;
}

// ---------------------------------------------------------------------------
// Input classification
// ---------------------------------------------------------------------------

export interface ClassifiedInputs {
  byName: Record<string, LogicValue>;
  list: LogicValue[];
  floating: string[];
}

function classifyInputs(
  comp: CircuitComponent,
  info: NonNullable<CircuitTopology['components'][number]>,
  params: DigitalCompParams,
  res: ResolvedDigitalParams,
  sim: DigitalSimState,
  nodeVoltages: Map<string, number> | null,
  t: number,
): ClassifiedInputs {
  const pins = devicePins(info.type, params);
  const nodes = info.nodes ?? [];
  const byName: Record<string, LogicValue> = {};
  const list: LogicValue[] = [];
  const floating: string[] = [];
  const prev = sim.prevInputs.get(comp.id);
  const changed = sim.inputChangedAt.get(comp.id) ?? [];
  let inIdx = 0;
  let changedDirty = false;

  pins.forEach((pin: DevicePinDef, fullIdx: number) => {
    if (pin.dir !== 'in') return;
    const node = nodes[fullIdx];
    let value: LogicValue;
    let isFloating = false;
    if (!node || !sim.driven.has(node)) {
      value = 'Z';
      isFloating = true;
    } else {
      const v = nodeVoltages?.get(node) ?? 0;
      if (!Number.isFinite(v)) value = 'X';
      else if (v < res.vil) value = '0';
      else if (v > res.vih) value = '1';
      else value = 'X';
    }

    if (value === 'Z') {
      // Async preset/clear pins default INACTIVE when floating — an
      // unwired PRE/CLR must not corrupt sequential state. Everything
      // else follows the family floating behaviour: real TTL floats
      // HIGH (enabled), CMOS is genuinely undefined.
      const isAsyncSetReset = pin.name === 'PRE' || pin.name === 'CLR';
      value = isAsyncSetReset
        ? (params.activeLow ? '1' : '0')
        : res.spec.floatingInput;
    }

    if (isFloating) floating.push(pin.name);

    // Track classified changes for setup/hold checks.
    const prevValue = prev?.[inIdx];
    if (prevValue !== undefined && prevValue !== value && changed[inIdx] !== t) {
      changed[inIdx] = t;
      changedDirty = true;
    }
    byName[pin.name] = value;
    list.push(value);
    inIdx++;
  });

  if (changedDirty || !sim.inputChangedAt.has(comp.id)) {
    sim.inputChangedAt.set(comp.id, changed);
  }
  return { byName, list, floating };
}

// ---------------------------------------------------------------------------
// Output scheduling and electrical values
// ---------------------------------------------------------------------------

/** Quantize a propagation delay to whole timesteps (min 1). */
function delaySteps(tpd: number, dt: number): number {
  const n = Math.round(tpd / dt);
  return Math.max(1, Number.isFinite(n) ? n : 1);
}

function voltsFor(value: LogicValue, res: ResolvedDigitalParams): number {
  if (value === '1') return res.voh;
  if (value === '0') return res.vol;
  if (value === 'X') return res.vcc / 2;
  return 0; // Z never drives
}

interface EvalOutcome {
  targets: LogicValue[];
  changed: boolean;
  violations: number;
  warnings: string[];
  floating: string[];
}

function evaluateDevice(
  comp: CircuitComponent,
  info: NonNullable<CircuitTopology['components'][number]>,
  sim: DigitalSimState,
  res: ResolvedDigitalParams,
  nodeVoltages: Map<string, number> | null,
  t: number,
  dt: number,
  timing: boolean,
): EvalOutcome | null {
  const def = getDeviceDef(info.type);
  if (!def || def.timeDriven) return null;
  const params = resolveDigitalCompParams(comp);
  const pins = devicePins(info.type, params);
  const runtime = sim.runtimes.get(comp.id);
  if (!runtime) return null;

  const classified = classifyInputs(comp, info, params, res, sim, nodeVoltages, t);
  runtime.inputs = classified.list;

  const outPins = pins.filter((p) => p.dir === 'out');
  const prevList = sim.prevInputs.get(comp.id);
  const prevByName: Record<string, LogicValue> = {};
  let inIdx = 0;
  for (const pin of pins) {
    if (pin.dir === 'in') {
      prevByName[pin.name] = prevList?.[inIdx] ?? classified.byName[pin.name];
      inIdx++;
    }
  }
  const changedAt: Record<string, number> = {};
  inIdx = 0;
  for (const pin of pins) {
    if (pin.dir === 'in') {
      changedAt[pin.name] = sim.inputChangedAt.get(comp.id)?.[inIdx] ?? -Infinity;
      inIdx++;
    }
  }

  const ctx: DeviceEvalCtx = {
    params,
    inputs: classified.byName,
    list: classified.list,
    prevInputs: prevByName,
    inputChangedAt: changedAt,
    state: runtime.state,
    t,
    dt,
    timing,
  };
  const result: DeviceEvalResult = def.eval(ctx);

  // Metastability window: force X on every output while active.
  const metastable = t < runtime.metastableUntil;

  const targets: LogicValue[] = outPins.map((p) => result.outputs[p.name] ?? '0');
  const finalTargets = targets.map((v) => (metastable ? 'X' : v));

  if (result.metastable && result.metastable > 0) {
    runtime.metastableUntil = Math.max(runtime.metastableUntil, t + result.metastable);
  }

  // Diff against current outputs → schedule events with propagation delay.
  const warnings: string[] = [];
  const warningsPrefix = `${comp.label}`;
  if (result.warnings) {
    for (const w of result.warnings) warnings.push(`${warningsPrefix}: ${w}`);
  }
  if (result.violation) {
    warnings.push(`${warningsPrefix}: setup/hold violation (metastability approximated)`);
  }

  let changed = false;
  if (!sim.storm) {
    const steps = delaySteps(res.tpd, dt);
    const dueTime = t + steps * dt;
    outPins.forEach((_p, k) => {
      if (finalTargets[k] !== runtime.outputs[k]) {
        sim.pending.push({ time: dueTime, compId: comp.id, pin: k, value: finalTargets[k] });
        changed = true;
      }
    });
  }

  // Persist sequential state (eval may return a new state object).
  if (result.state) runtime.state = result.state;

  return {
    targets: finalTargets,
    changed,
    violations: result.violation ? 1 : 0,
    warnings,
    floating: classified.floating,
  };
}

function advanceRuntimes(sim: DigitalSimState, doc: CircuitDoc, t: number, res: (c: CircuitComponent) => ResolvedDigitalParams): void {
  for (const comp of doc.components) {
    const runtime = sim.runtimes.get(comp.id);
    if (!runtime) continue;
    const r = res(comp);
    runtime.outVolts = runtime.outVolts.map((_, k) => {
      const start = runtime.transStart[k];
      if (start < 0) return voltsFor(runtime.outputs[k], r);
      const dur = runtime.transDur[k] > 0 ? runtime.transDur[k] : 1e-12;
      const p = (t - start) / dur;
      if (p >= 1) {
        runtime.transStart[k] = -1;
        return voltsFor(runtime.outputs[k], r);
      }
      const from = runtime.fromVolts[k];
      const to = voltsFor(runtime.outputs[k], r);
      return from + (to - from) * Math.max(0, p);
    });
  }
}

function applyDueEvents(sim: DigitalSimState, doc: CircuitDoc, t: number, res: (c: CircuitComponent) => ResolvedDigitalParams): void {
  if (sim.pending.length === 0) return;
  sim.pending.sort((a, b) => a.time - b.time || a.compId.localeCompare(b.compId) || a.pin - b.pin);
  const remaining: DigitalEvent[] = [];
  for (const ev of sim.pending) {
    if (ev.time > t + 1e-15) {
      remaining.push(ev);
      continue;
    }
    const runtime = sim.runtimes.get(ev.compId);
    const comp = doc.components.find((c) => c.id === ev.compId);
    if (!runtime || !comp || ev.pin >= runtime.outputs.length) continue;
    if (runtime.outputs[ev.pin] !== ev.value) {
      runtime.fromVolts[ev.pin] = runtime.outVolts[ev.pin];
      const rising = ev.value === '1';
      runtime.transStart[ev.pin] = t;
      runtime.transDur[ev.pin] = rising ? res(comp).tr : res(comp).tf;
      runtime.outputs[ev.pin] = ev.value;
      runtime.actCount++;
    }
  }
  sim.pending = remaining;
}

function updateClocks(doc: CircuitDoc, sim: DigitalSimState, t: number, res: (c: CircuitComponent) => ResolvedDigitalParams): void {
  for (const comp of doc.components) {
    if (comp.type !== 'clock-generator') continue;
    const params = resolveDigitalCompParams(comp);
    const runtime = sim.runtimes.get(comp.id);
    if (!runtime || runtime.outputs.length === 0) continue;
    if (!params.enabled || params.frequency <= 0) continue;
    const r = res(comp);
    const period = 1 / params.frequency;
    const phaseOffset = (((params.phaseDeg % 360) + 360) % 360) / 360;
    let phase = (t / period - phaseOffset) % 1;
    if (phase < 0) phase += 1;
    const value: LogicValue = phase < params.dutyCycle / 100 ? '1' : '0';
    if (value !== runtime.outputs[0]) {
      runtime.fromVolts[0] = runtime.outVolts[0];
      runtime.transStart[0] = t;
      runtime.transDur[0] = value === '1' ? r.tr : r.tf;
      runtime.outputs[0] = value;
      runtime.actCount++;
    }
  }
}

function updateActivity(doc: CircuitDoc, sim: DigitalSimState, t: number): void {
  for (const comp of doc.components) {
    const runtime = sim.runtimes.get(comp.id);
    if (!runtime) continue;
    if (runtime.actWindowStart === 0) runtime.actWindowStart = t;
    const span = t - runtime.actWindowStart;
    if (span >= 1) {
      runtime.switchRate = runtime.actCount / span;
      runtime.actCount = 0;
      runtime.actWindowStart = t;
    }
  }
}

// ---------------------------------------------------------------------------
// Per-step advance (transient engine)
// ---------------------------------------------------------------------------

export interface DigitalStepResult {
  warnings: string[];
  /** estimated total digital supply power this step (W) */
  power: number;
}

/**
 * Advance the digital kernel by one analog timestep. Mutates `sim`.
 * `nodeVoltages` are the SOLVED voltages of the previous step — inputs are
 * classified from the most recent electrical reality, and the freshly
 * stamped outputs influence the solve that follows.
 */
export function advanceDigital(
  doc: CircuitDoc,
  topology: CircuitTopology,
  sim: DigitalSimState,
  t: number,
  dt: number,
  nodeVoltages: Map<string, number> | null,
): DigitalStepResult {
  ensureRuntimes(doc, sim);
  refreshDriverAnalysis(doc, topology, sim);
  const resOf = (c: CircuitComponent) => {
    const params = resolveDigitalCompParams(c);
    return resolveDigitalParams(params.family, params.vcc, params.tpd);
  };

  applyDueEvents(sim, doc, t, resOf);
  updateClocks(doc, sim, t, resOf);

  const warnings = new Set<string>();

  // Event storm guard: combinational loops oscillate with >= 1-step delay;
  // cap the queue so the engine degrades gracefully instead of exploding.
  // Once latched the storm holds for the rest of the run (Stop/Reset clears
  // it) — the circuit keeps its last outputs and the warning stays up.
  if (sim.pending.length > MAX_PENDING_EVENTS) {
    sim.storm = true;
    sim.pending = [];
  }
  if (sim.storm) {
    warnings.add('Excessive digital event activity — possible combinational oscillation (outputs frozen)');
  }

  for (const info of topology.components) {
    if (!isDigitalDeviceType(info.type)) continue;
    const comp = doc.components.find((c) => c.id === info.id);
    if (!comp) continue;
    const params = resolveDigitalCompParams(comp);
    const res = resolveDigitalParams(params.family, params.vcc, params.tpd);
    if (res.vccOutOfRange) {
      warnings.add(`${comp.label}: supply ${params.vcc} V outside ${res.spec.label} range (${res.spec.vccMin}–${res.spec.vccMax} V)`);
    }
    const runtime = sim.runtimes.get(comp.id);
    if (!runtime) continue;
    if (runtime.switchRate > OSCILLATION_RATE) {
      warnings.add(`${comp.label}: sustained oscillation suspected (${Math.round(runtime.switchRate)} transitions/s)`);
    }

    // Fan-out: count the digital inputs hung on each of this device's
    // output nodes and compare with the family limit.
    const pins = devicePins(info.type, params);
    const nodes = info.nodes ?? [];
    let outCount = 0;
    let worstFanout = 0;
    for (let fullIdx = 0; fullIdx < pins.length; fullIdx++) {
      if (pins[fullIdx].dir !== 'out') continue;
      outCount++;
      const node = nodes[fullIdx];
      if (!node) continue;
      worstFanout = Math.max(
        worstFanout,
        countDigitalFanout(doc.components, topology.components, comp.id, node),
      );
    }
    if (outCount > 0 && worstFanout > res.spec.fanout) {
      warnings.add(
        `${comp.label}: fan-out exceeded (${worstFanout} loads > ${res.spec.fanout} max for ${res.spec.label})`,
      );
    }

    const outcome = evaluateDevice(comp, info, sim, res, nodeVoltages, t, dt, true);
    if (!outcome) continue;
    for (const w of outcome.warnings) warnings.add(w);

    // Floating input warnings (family-specific message).
    for (const pinName of outcome.floating) {
      if (pinName === 'OUT') continue;
      warnings.add(
        res.spec.floatingInput === '1'
          ? `${comp.label} pin ${pinName} floats — reads HIGH (TTL behaviour)`
          : `${comp.label} pin ${pinName} floats — state UNKNOWN (X)`,
      );
    }
  }

  // Contention warnings.
  for (const [node, contended] of sim.contention) {
    if (!contended) continue;
    const compIds = topology.nodes.get(node)?.connectedComponents ?? [];
    const label = compIds
      .map((id) => doc.components.find((c) => c.id === id)?.label)
      .filter(Boolean)
      .join(', ');
    warnings.add(`Output contention between drivers on a shared node (${label || node}) — X propagates`);
  }

  advanceRuntimes(sim, doc, t, resOf);
  updateActivity(doc, sim, t);

  // Persist the classified inputs for the next step's edge detection.
  sim.prevInputs.clear();
  for (const info of topology.components) {
    if (!isDigitalDeviceType(info.type)) continue;
    const runtime = sim.runtimes.get(info.id);
    if (runtime) sim.prevInputs.set(info.id, [...runtime.inputs]);
  }

  // Estimated supply power: static + dynamic (α·C·V²·f per device).
  let power = 0;
  for (const comp of doc.components) {
    const runtime = sim.runtimes.get(comp.id);
    if (!runtime) continue;
    const params = resolveDigitalCompParams(comp);
    const res = resolveDigitalParams(params.family, params.vcc, params.tpd);
    const outs = devicePins(comp.type, params).filter((p) => p.dir === 'out').length;
    const cLoad = estimateLoadCapacitance(res.spec, outs);
    power += res.spec.staticPower + runtime.switchRate * 0.5 * cLoad * res.vcc * res.vcc;
  }

  sim.activeWarnings = [...warnings].slice(0, 50);
  return { warnings: sim.activeWarnings, power };
}

// ---------------------------------------------------------------------------
// Static (DC) evaluation — steady-state operating point
// ---------------------------------------------------------------------------

/**
 * Evaluate the digital network to a steady state for the DC solve. There is
 * no time base: sequential devices hold their state (or their async
 * preset/clear), combinational logic settles through unit-delay iterations
 * and is flagged X if it fails to converge (oscillating loop).
 */
export function evaluateDigitalStatic(
  doc: CircuitDoc,
  topology: CircuitTopology,
  sim: DigitalSimState,
  nodeVoltages: Map<string, number> | null,
  dt: number,
): void {
  ensureRuntimes(doc, sim);
  refreshDriverAnalysis(doc, topology, sim);

  // Combinational settling: unit-delay iterations until stable.
  let changed = true;
  let iterations = 0;
  const warnings = new Set<string>();
  const MAX_ITER = 32;

  while (changed && iterations < MAX_ITER) {
    changed = false;
    iterations++;
    for (const info of topology.components) {
      if (!isDigitalDeviceType(info.type)) continue;
      const comp = doc.components.find((c) => c.id === info.id);
      if (!comp) continue;
      const def = getDeviceDef(info.type);
      if (!def || def.timeDriven) continue;
      const params = resolveDigitalCompParams(comp);
      const res = resolveDigitalParams(params.family, params.vcc, params.tpd);
      const runtime = sim.runtimes.get(comp.id);
      if (!runtime) continue;

      const classified = classifyInputs(comp, info, params, res, sim, nodeVoltages, 0);
      runtime.inputs = classified.list;

      const pins = devicePins(info.type, params);
      const outPins = pins.filter((p) => p.dir === 'out');
      const prevByName: Record<string, LogicValue> = {};
      let inIdx = 0;
      for (const pin of pins) {
        if (pin.dir === 'in') {
          prevByName[pin.name] = classified.byName[pin.name];
          inIdx++;
        }
      }
      const changedAt: Record<string, number> = {};
      inIdx = 0;
      for (const pin of pins) {
        if (pin.dir === 'in') {
          changedAt[pin.name] = 0;
          inIdx++;
        }
      }
      const ctx: DeviceEvalCtx = {
        params,
        inputs: classified.byName,
        list: classified.list,
        prevInputs: prevByName,
        inputChangedAt: changedAt,
        state: runtime.state,
        t: 0,
        dt,
        timing: false,
      };
      const result = def.eval(ctx);
      outPins.forEach((p, k) => {
        const target = result.outputs[p.name] ?? '0';
        if (target !== runtime.outputs[k]) {
          runtime.outputs[k] = target;
          runtime.outVolts[k] = voltsFor(target, res);
          runtime.transStart[k] = -1;
          changed = true;
        }
      });
      if (result.state) runtime.state = result.state;
      for (const w of result.warnings ?? []) warnings.add(`${comp.label}: ${w}`);
    }
  }

  if (changed && iterations >= MAX_ITER) {
    // Did not settle — a combinational loop. Mark every output X so the
    // readouts and downstream gates show the instability honestly.
    for (const info of topology.components) {
      if (!isDigitalDeviceType(info.type)) continue;
      const def = getDeviceDef(info.type);
      if (!def || def.timeDriven) continue;
      const runtime = sim.runtimes.get(info.id);
      if (!runtime) continue;
      runtime.outputs = runtime.outputs.map(() => 'X');
      runtime.outVolts = runtime.outVolts.map(() => 0);
      runtime.transStart = runtime.transStart.map(() => -1);
    }
    warnings.add('Combinational logic did not settle (oscillating loop?) — outputs forced X');
  }

  // Voltage-driven refresh + warnings mirror the transient pass.
  for (const info of topology.components) {
    if (!isDigitalDeviceType(info.type)) continue;
    const comp = doc.components.find((c) => c.id === info.id);
    if (!comp) continue;
    const params = resolveDigitalCompParams(comp);
    const res = resolveDigitalParams(params.family, params.vcc, params.tpd);
    const runtime = sim.runtimes.get(comp.id);
    if (!runtime) continue;
    runtime.outVolts = runtime.outputs.map((v) => voltsFor(v, res));
    if (res.vccOutOfRange) {
      warnings.add(`${comp.label}: supply ${params.vcc} V outside ${res.spec.label} range (${res.spec.vccMin}–${res.spec.vccMax} V)`);
    }
    const classified = classifyInputs(comp, info, params, res, sim, nodeVoltages, 0);
    runtime.inputs = classified.list;
    for (const pinName of classified.floating) {
      warnings.add(
        res.spec.floatingInput === '1'
          ? `${comp.label} pin ${pinName} floats — reads HIGH (TTL behaviour)`
          : `${comp.label} pin ${pinName} floats — state UNKNOWN (X)`,
      );
    }
  }

  for (const [node, contended] of sim.contention) {
    if (!contended) continue;
    warnings.add(`Output contention on a shared node (${node}) — X propagates`);
  }

  sim.activeWarnings = [...warnings].slice(0, 50);
}
