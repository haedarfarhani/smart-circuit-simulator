/**
 * Electrical bridge between the digital kernel and the MNA solver.
 *
 * Every digital output is a Norton equivalent to ground: a conductance
 * g = 1/Rout in parallel with a current source g·V out, where V tracks the
 * kernel's output voltage (VOH / VOL / mid-rail for X, ramping through
 * rise/fall transitions). This adds NO extra matrix rows, and the analog
 * consequences — voltage sag under load, output contention landing between
 * the rails, a segment LED dimming an output — emerge from the normal
 * solve.
 *
 * Inputs load their node according to the family: CMOS ≈ open plus the
 * input capacitance for the dynamic-power story; TTL presents its real
 * input currents (IIL when low — the input sources current toward the
 * driver — IIH when high), which is what makes TTL fan-out limits matter.
 *
 * X outputs drive VCC/2 through Rout: the dangerous midpoint a real
 * metastable or contended node shows, without pretending to predict an
 * exact analog voltage.
 */

import type { CircuitComponent, ComponentType } from '../../models/circuit';
import { devicePins } from './devices';
import { resolveDigitalParams, type ResolvedDigitalParams } from './families';
import type { DeviceRuntime } from './kernel';
import type { LogicValue } from './logic';
import { isDigitalDeviceType, resolveDigitalCompParams } from './types';

// ---------------------------------------------------------------------------
// Solution payloads (attached to ComponentSolution)
// ---------------------------------------------------------------------------

/** Digital device telemetry: what the Inspector and canvas overlays show. */
export interface DigitalSolution {
  /** classified input values, in input-pin order */
  inputs: LogicValue[];
  inputNames: string[];
  /** output logic values, in output-pin order */
  outputs: LogicValue[];
  outputNames: string[];
  /** electrical output volts, in output-pin order */
  outVolts: number[];
  /** sequential state bits (0/1, -1 = X) where applicable */
  stateBits?: number[];
  /** counter numeric value where applicable */
  count?: number;
  /** decoded value for counter-style devices ('A'..'F', '-') */
  display?: string;
  family: string;
  vcc: number;
  /** estimated supply power (W): static + dynamic switching estimate */
  power: number;
  /** highest observed fan-out across this device's outputs */
  fanout?: number;
}

/** Per-segment electrical state of a seven-segment display. */
export interface SevenSegSolution {
  /** 0..1 emission intensity per segment (A,B,C,D,E,F,G,DP) */
  brightness: number[];
  /** conduction state per segment */
  conducting: boolean[];
  common: 'common-cathode' | 'common-anode';
}

const STATE_BIT_KEYS = ['q', 'bits', 'q0', 'count'] as const;

/** Extract displayable sequential bits from a device runtime state. */
function extractStateBits(runtime: DeviceRuntime): { bits?: number[]; count?: number } {
  const st = runtime.state as Record<string, unknown>;
  const q = st.q;
  if (Array.isArray(q)) {
    return {
      bits: q.map((v) => (v === '1' ? 1 : v === '0' ? 0 : -1)),
      count: q.every((v) => v === '0' || v === '1')
        ? (q as LogicValue[]).reduce((acc, v, i) => acc + (v === '1' ? 1 << i : 0), 0)
        : undefined,
    };
  }
  if (q === '0' || q === '1' || q === 'X') return { bits: [q === '1' ? 1 : q === '0' ? 0 : -1] };
  void STATE_BIT_KEYS;
  return {};
}

/** A digital component's pins in full (terminal-index) order. */
export interface DigitalPinView {
  name: string;
  dir: 'in' | 'out';
  /** full terminal index (matches ComponentInfo.nodes and wire endpoints) */
  index: number;
  /** index within inputs / outputs respectively */
  ioIndex: number;
}

export function digitalPinView(comp: CircuitComponent): DigitalPinView[] {
  const params = resolveDigitalCompParams(comp);
  const pins = devicePins(comp.type, params);
  let inIdx = 0;
  let outIdx = 0;
  return pins.map((p, i) => ({
    name: p.name,
    dir: p.dir,
    index: i,
    ioIndex: p.dir === 'in' ? inIdx++ : outIdx++,
  }));
}

/**
 * Stamp one digital device into the instantaneous network.
 *
 * `docComp` supplies the component's own parameters (family, supply,
 * width…); `nodes` are the terminal node ids in terminal order (from
 * ComponentInfo); `runtime` carries logic states and output volts;
 * `prevNodeVoltages` (previous step's solve) feeds the CMOS input
 * capacitance companion.
 */
export function stampDigitalComponent(
  G: number[][],
  I: number[],
  nodeIndex: Map<string, number>,
  docComp: CircuitComponent,
  nodes: string[],
  runtime: DeviceRuntime,
  res: ResolvedDigitalParams,
  dt: number,
  prevNodeVoltages: Map<string, number> | null,
): void {
  const params = resolveDigitalCompParams(docComp);
  const pins = devicePins(docComp.type, params);
  let outIdx = 0;
  let inIdx = 0;

  for (let fullIdx = 0; fullIdx < pins.length; fullIdx++) {
    const pin = pins[fullIdx];
    const node = nodes[fullIdx];
    const n = node ? nodeIndex.get(node) : undefined;
    if (n === undefined) {
      if (pin.dir === 'out') outIdx++;
      else inIdx++;
      continue;
    }

    if (pin.dir === 'out') {
      const value = runtime.outputs[outIdx] ?? 'Z';
      const v = runtime.outVolts[outIdx] ?? 0;
      if (value === 'Z') {
        // Tri-stated / undriven: leakage only.
        G[n][n] += res.spec.zLeakage;
      } else {
        const g = 1 / (value === '1' ? res.spec.routHigh : res.spec.routLow);
        if (g > 0 && Number.isFinite(g)) {
          G[n][n] += g;
          I[n] += g * v;
        }
      }
      outIdx++;
    } else {
      // Input loading.
      const classified = runtime.inputs[inIdx] ?? 'Z';
      if (res.spec.technology === 'ttl') {
        // TTL: low input sources IIL toward the driver (modeled as a
        // conductance up to VCC); high input absorbs IIH (conductance to
        // ground). X loads like high (small).
        if (classified === '0') {
          const g = Math.abs(res.spec.iil) / Math.max(res.vcc - res.vol, 0.5);
          G[n][n] += g;
          I[n] += g * res.vcc;
        } else {
          const g = res.spec.iih / Math.max(res.vih, 1);
          G[n][n] += g;
        }
      } else {
        // CMOS: essentially open at DC; a small input capacitance keeps
        // the dynamic-power estimate honest and gives fast edges something
        // to charge.
        const cin = res.spec.cin;
        if (cin > 0 && dt > 0) {
          const gEq = cin / dt;
          const vPrev = prevNodeVoltages?.get(node) ?? 0;
          G[n][n] += gEq;
          I[n] += gEq * vPrev;
        }
      }
      inIdx++;
    }
  }
}

/**
 * Current into each pin of a digital device (positive INTO the device),
 * computed from the solved node voltages. Feeds telemetry and the wire
 * current animation through `terminalCurrents`.
 *
 * `prevNodeVoltages` is the previous step's solved voltages (for the CMOS
 * input-capacitor current).
 */
export function digitalPinCurrents(
  docComp: CircuitComponent,
  runtime: DeviceRuntime,
  res: ResolvedDigitalParams,
  nodeVoltages: Map<string, number>,
  prevNodeVoltages: Map<string, number> | null,
  nodes: string[],
  dt: number,
): number[] {
  const params = resolveDigitalCompParams(docComp);
  const pins = devicePins(docComp.type, params);
  const currents = new Array(pins.length).fill(0);
  let outIdx = 0;
  let inIdx = 0;

  for (let fullIdx = 0; fullIdx < pins.length; fullIdx++) {
    const pin = pins[fullIdx];
    const node = nodes[fullIdx];
    const v = node ? (nodeVoltages.get(node) ?? 0) : 0;
    if (pin.dir === 'out') {
      const value = runtime.outputs[outIdx] ?? 'Z';
      if (value === 'Z') {
        currents[fullIdx] = res.spec.zLeakage * v;
      } else {
        const g = 1 / (value === '1' ? res.spec.routHigh : res.spec.routLow);
        const vOut = runtime.outVolts[outIdx] ?? 0;
        // into device = g·vNode − g·V (negative when sourcing a load)
        currents[fullIdx] = g * v - g * vOut;
      }
      outIdx++;
    } else {
      const classified = runtime.inputs[inIdx] ?? 'Z';
      if (res.spec.technology === 'ttl') {
        if (classified === '0') {
          const g = Math.abs(res.spec.iil) / Math.max(res.vcc - res.vol, 0.5);
          currents[fullIdx] = g * v - g * res.vcc;
        } else {
          const g = res.spec.iih / Math.max(res.vih, 1);
          currents[fullIdx] = g * v;
        }
      } else {
        const cin = res.spec.cin;
        if (cin > 0 && dt > 0) {
          const gEq = cin / dt;
          const vPrev = node ? (prevNodeVoltages?.get(node) ?? 0) : 0;
          currents[fullIdx] = gEq * (v - vPrev);
        }
      }
      inIdx++;
    }
  }
  return currents;
}

/**
 * Fan-out check: count the input pins of other digital devices sharing an
 * output's node. Returns the count so the kernel can compare with the
 * family limit.
 */
export function countDigitalFanout(
  doc: CircuitComponent[],
  topologyComponents: { id: string; type: ComponentType; nodes?: string[] }[],
  driverCompId: string,
  driverNode: string,
): number {
  let count = 0;
  for (const info of topologyComponents) {
    if (info.id === driverCompId || !isDigitalDeviceType(info.type)) continue;
    const comp = doc.find((c) => c.id === info.id);
    if (!comp) continue;
    const params = resolveDigitalCompParams(comp);
    const pins = devicePins(info.type, params);
    for (let fullIdx = 0; fullIdx < pins.length; fullIdx++) {
      if (pins[fullIdx].dir !== 'in') continue;
      if ((info.nodes ?? [])[fullIdx] === driverNode) count++;
    }
  }
  return count;
}

/** True when a component type is stamped by the digital bridge. */
export function isDigitalStamped(type: ComponentType): boolean {
  return isDigitalDeviceType(type) || type === 'seven-segment-display';
}

// ---------------------------------------------------------------------------
// Seven-segment display: purely electrical, eight segment diodes
// ---------------------------------------------------------------------------

/** Terminal order of the display: segments A..G, DP, then COM. */
export const SEVEN_SEG_PINS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP', 'COM'];
export const SEVEN_SEG_SEGMENT_COUNT = 8;

/** Forward voltage of one display segment (V) — an LED junction. */
export function sevenSegForwardVoltage(comp: CircuitComponent): number {
  return comp.forwardVoltage && comp.forwardVoltage > 0 ? comp.forwardVoltage : 2.0;
}

/**
 * Per-segment conduction of a seven-segment display from node voltages.
 * Common cathode: segment anode voltage exceeds COM by Vf → conducts.
 * Common anode: COM exceeds segment cathode voltage by Vf → conducts.
 */
export function sevenSegConduction(
  comp: CircuitComponent,
  nodeVoltages: Map<string, number>,
  nodes: string[],
  prev: boolean[],
): boolean[] {
  const params = resolveDigitalCompParams(comp);
  const vf = sevenSegForwardVoltage(comp);
  const comIdx = 8;
  const vCom = nodes[comIdx] ? (nodeVoltages.get(nodes[comIdx]) ?? 0) : 0;
  const next: boolean[] = [];
  for (let i = 0; i < SEVEN_SEG_SEGMENT_COUNT; i++) {
    const vSeg = nodes[i] ? (nodeVoltages.get(nodes[i]) ?? 0) : 0;
    const vDiff =
      params.commonType === 'common-anode' ? vCom - vSeg : vSeg - vCom;
    // 50 mV hysteresis margin, mirroring the diode model's update rule.
    const should = prev[i] ? vDiff >= vf - 0.05 : vDiff >= vf + 0.05;
    next.push(should);
  }
  return next;
}

/** Stamp the eight segment diodes of a conducting-state snapshot. */
export function stampSevenSeg(
  G: number[][],
  I: number[],
  nodeIndex: Map<string, number>,
  comp: CircuitComponent,
  nodes: string[],
  conducting: boolean[],
): void {
  const params = resolveDigitalCompParams(comp);
  const vf = sevenSegForwardVoltage(comp);
  const rOn = 1.0;
  const gOff = 1e-7;
  const comIdx = 8;
  for (let i = 0; i < SEVEN_SEG_SEGMENT_COUNT; i++) {
    // Common cathode: segment pin is the anode, COM the cathode. Common
    // anode: the roles flip.
    const anodeIdx = params.commonType === 'common-anode' ? comIdx : i;
    const cathodeIdx = params.commonType === 'common-anode' ? i : comIdx;
    const nA = nodes[anodeIdx] ? nodeIndex.get(nodes[anodeIdx]) : undefined;
    const nC = nodes[cathodeIdx] ? nodeIndex.get(nodes[cathodeIdx]) : undefined;
    if (nA === undefined && nC === undefined) continue;
    if (conducting[i]) {
      const g = 1 / rOn;
      if (nA !== undefined) {
        G[nA][nA] += g;
        I[nA] += g * vf;
      }
      if (nC !== undefined) {
        G[nC][nC] += g;
        I[nC] -= g * vf;
      }
    } else {
      if (nA !== undefined) G[nA][nA] += gOff;
      if (nC !== undefined) G[nC][nC] += gOff;
    }
  }
}

/** Current through each segment given the solved voltages (A). */
export function sevenSegSegmentCurrents(
  comp: CircuitComponent,
  nodeVoltages: Map<string, number>,
  nodes: string[],
  conducting: boolean[],
): number[] {
  const vf = sevenSegForwardVoltage(comp);
  const rOn = 1.0;
  const gOff = 1e-7;
  const comIdx = 8;
  const vCom = nodes[comIdx] ? (nodeVoltages.get(nodes[comIdx]) ?? 0) : 0;
  const currents: number[] = [];
  for (let i = 0; i < SEVEN_SEG_SEGMENT_COUNT; i++) {
    const vSeg = nodes[i] ? (nodeVoltages.get(nodes[i]) ?? 0) : 0;
    const vDiff =
      comp.commonType === 'common-anode' ? vCom - vSeg : vSeg - vCom;
    currents[i] = conducting[i] ? Math.max(0, (vDiff - vf) / rOn) : vDiff * gOff;
  }
  return currents;
}

/** Convenience: resolved electrical parameters for a doc component. */
export function resolveCompDigitalParams(comp: CircuitComponent): ResolvedDigitalParams {
  const params = resolveDigitalCompParams(comp);
  return resolveDigitalParams(params.family, params.vcc, params.tpd);
}

/**
 * Build the telemetry payload for one digital device from its runtime.
 * `docComponents` (the full document component list) backs the fan-out
 * count; `topologyComponents` supplies each device's terminal nodes.
 */
export function buildDigitalComponentSolution(
  comp: CircuitComponent,
  runtime: DeviceRuntime,
  docComponents: CircuitComponent[],
  topologyComponents: { id: string; type: ComponentType; nodes?: string[] }[],
  nodeVoltages: Map<string, number>,
  nodes: string[],
): DigitalSolution {
  void nodeVoltages;
  const params = resolveDigitalCompParams(comp);
  const res = resolveDigitalParams(params.family, params.vcc, params.tpd);
  const pins = devicePins(comp.type, params);
  const inputNames: string[] = [];
  const outputNames: string[] = [];
  for (const p of pins) {
    if (p.dir === 'in') inputNames.push(p.name);
    else outputNames.push(p.name);
  }
  const { bits, count } = extractStateBits(runtime);

  // Fan-out: highest count of connected digital inputs on any output node.
  let fanout = 0;
  for (let fullIdx = 0; fullIdx < pins.length; fullIdx++) {
    if (pins[fullIdx].dir !== 'out') continue;
    const node = nodes[fullIdx];
    if (node) {
      fanout = Math.max(
        fanout,
        countDigitalFanout(docComponents, topologyComponents, comp.id, node),
      );
    }
  }

  const cLoadPer = 10e-12;
  const power =
    res.spec.staticPower + runtime.switchRate * 0.5 * cLoadPer * res.vcc * res.vcc;

  return {
    inputs: [...runtime.inputs],
    inputNames,
    outputs: [...runtime.outputs],
    outputNames,
    outVolts: [...runtime.outVolts],
    stateBits: bits,
    count,
    family: res.spec.label,
    vcc: res.vcc,
    power,
    fanout: fanout > 0 ? fanout : undefined,
  };
}

/**
 * Per-segment brightness of a seven-segment display from solved currents.
 * `segmentCurrents` holds the current through each segment diode (A).
 */
export function buildSevenSegSolution(
  comp: CircuitComponent,
  segmentCurrents: number[],
  conducting: boolean[],
): SevenSegSolution {
  const params = resolveDigitalCompParams(comp);
  return {
    brightness: segmentCurrents.map((i) => Math.min(1, Math.max(0, Math.abs(i) / 0.02))),
    conducting: [...conducting],
    common: params.commonType,
  };
}
