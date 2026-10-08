/**
 * AC steady-state (phasor) analysis.
 *
 * A DC operating point cannot describe an AC supply: at DC a capacitor is an
 * open circuit and a coil is just its winding resistance, so an `acVoltageSource`
 * behaves exactly like a battery. Here the circuit is solved in the frequency
 * domain at each frequency present in the document, with the reactances that
 * frequency implies:
 *
 *   capacitor  Y = jωC          (conducts as frequency rises)
 *   coil       Y = 1/(R + jωL)  (impedance rises with frequency, current lags)
 *   resistor   Y = 1/R          (unchanged, but carries the AC current)
 *
 * Source values are treated as RMS, which is what an AC meter reads and what a
 * lamp rating or a motor nameplate means. Voltages and currents come back as
 * phasors; real power is P = Re(V·I*), so a pure capacitor or coil dissipates
 * nothing even while carrying current.
 */

import type { CircuitDoc } from '../models/circuit';
import type { CircuitTopology, ComponentInfo } from './solver';
import { lampResistance } from './solver';

/** A phasor: `re` is the in-phase (0°) part, `im` the 90°-lagging part. */
export interface Phasor {
  re: number;
  im: number;
}

export interface AcSolution {
  frequency: number;
  /** RMS node potentials, the reference node being 0 */
  nodeVoltages: Map<string, Phasor>;
  /** RMS voltage and current phasors per component id */
  voltage: Map<string, Phasor>;
  current: Map<string, Phasor>;
  /** average real power per component id, in watts */
  power: Map<string, number>;
}

const ZERO: Phasor = { re: 0, im: 0 };

const cx = (re: number, im = 0): Phasor => ({ re, im });
const cAdd = (a: Phasor, b: Phasor): Phasor => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a: Phasor, b: Phasor): Phasor => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a: Phasor, b: Phasor): Phasor => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cScale = (a: Phasor, k: number): Phasor => ({ re: a.re * k, im: a.im * k });
const cConj = (a: Phasor): Phasor => ({ re: a.re, im: -a.im });

function cDiv(a: Phasor, b: Phasor): Phasor {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) return ZERO;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

/** Phasor magnitude, i.e. the RMS value. */
export const phasorMag = (a: Phasor): number => Math.hypot(a.re, a.im);

/** Phasor angle in radians. */
export const phasorAngle = (a: Phasor): number => Math.atan2(a.im, a.re);

/**
 * Distinct source frequencies in the document, in Hz. An AC source with no
 * frequency set is a mains-frequency source.
 */
export const DEFAULT_AC_FREQUENCY = 50;

export function acFrequencies(doc: CircuitDoc): number[] {
  const out: number[] = [];
  for (const comp of doc.components) {
    if (comp.type !== 'acVoltageSource') continue;
    const f = comp.frequency ?? DEFAULT_AC_FREQUENCY;
    if (Number.isFinite(f) && f > 0 && !out.includes(f)) out.push(f);
  }
  return out;
}

/**
 * Synchronous speed of an AC machine: n = 120·f / poles.
 * A four-pole machine on a 50 Hz supply therefore runs at 1500 rpm, well
 * above the few hundred rpm a small DC motor manages at the same current.
 */
export function synchronousSpeedRpm(frequency: number, poles = 4): number {
  if (!Number.isFinite(frequency) || frequency <= 0) return 0;
  return (120 * frequency) / poles;
}

/** True when the document drives the circuit with an alternating supply. */
export function hasAcSource(doc: CircuitDoc): boolean {
  return doc.components.some((c) => c.type === 'acVoltageSource');
}

/** The supply a lamp is rated against (RMS for an AC source). */
function supplyVoltageOf(doc: CircuitDoc): number {
  return (
    doc.components.find((c) => c.type === 'battery' || c.type === 'acVoltageSource')?.value ?? 0
  );
}

/**
 * Complex admittance of one two-terminal component at `omega`.
 * Voltage/current sources are handled as branch constraints, not admittances.
 */
function admittanceOf(comp: ComponentInfo, omega: number, supplyVoltage: number): Phasor {
  switch (comp.type) {
    case 'capacitor':
      // Y = jωC
      return cx(0, omega * Math.max(comp.value, 0));

    case 'solenoid': {
      // Z = R + jωL
      const l = Math.max(comp.inductance ?? 0, 0);
      const r = comp.value > 0 ? comp.value : 1e-3;
      return cDiv(cx(1), cAdd(cx(r), cx(0, omega * l)));
    }

    case 'lamp': {
      const r = lampResistance(comp.value, supplyVoltage);
      return cx(Number.isFinite(r) && r > 0 ? 1 / r : 0);
    }

    case 'acMotor':
      return cx(1 / (comp.value > 0 ? comp.value : 15));

    default:
      // Resistors, switches and anything else that is an ideal resistance.
      // A component whose value is 0 has no defined impedance; the DC path
      // treats that as a strap, so this one does too.
      return cx(comp.value > 0 ? 1 / comp.value : 1e12);
  }
}

/** Gauss-Jordan elimination with magnitude pivoting, in complex arithmetic. */
function solveComplexSystem(A: Phasor[][], b: Phasor[]): Phasor[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (phasorMag(M[k][i]) > phasorMag(M[maxRow][i])) maxRow = k;
    }

    if (phasorMag(M[maxRow][i]) < 1e-12) return null;

    if (maxRow !== i) {
      [M[i], M[maxRow]] = [M[maxRow], M[i]];
    }

    const pivot = M[i][i];
    for (let j = i; j <= n; j++) {
      M[i][j] = cDiv(M[i][j], pivot);
    }

    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = M[k][i];
      if (factor.re === 0 && factor.im === 0) continue;
      for (let j = i; j <= n; j++) {
        M[k][j] = cSub(M[k][j], cMul(factor, M[i][j]));
      }
    }
  }

  return M.map((row) => row[n]);
}

/**
 * Solve the circuit in the frequency domain at a single frequency.
 * Every other independent source is replaced by its own AC equivalent: DC
 * supplies become short circuits and current sources become open circuits,
 * which is what superposition demands. Returns null when the network has no
 * admissible solution at this frequency.
 */
export function solveAcSteadyState(
  doc: CircuitDoc,
  topology: CircuitTopology,
  frequency: number,
): AcSolution | null {
  const { nodes, components } = topology;
  const omega = 2 * Math.PI * frequency;
  const supplyVoltage = supplyVoltageOf(doc);

  const connectedNodeIds = new Set<string>();
  for (const c of components) {
    if (c.nodeA) connectedNodeIds.add(c.nodeA);
    if (c.nodeB) connectedNodeIds.add(c.nodeB);
  }
  if (connectedNodeIds.size === 0) return null;

  let ground = topology.groundNode;
  if (!connectedNodeIds.has(ground)) {
    ground = connectedNodeIds.values().next().value!;
  }

  const nodeList = Array.from(nodes.values()).filter(
    (n) => n.id !== ground && connectedNodeIds.has(n.id),
  );
  const nodeIndex = new Map<string, number>();
  nodeList.forEach((node, i) => nodeIndex.set(node.id, i));

  // Sources that act as shorts at AC (batteries) and the AC sources themselves.
  const sourceBranches = components.filter((c) => c.voltageSource);
  const numNodes = nodeList.length;
  const vsIndex = new Map<string, number>();
  sourceBranches.forEach((vs, i) => vsIndex.set(vs.id, numNodes + i));

  const loads = components.filter((c) => !c.voltageSource && !c.currentSource);
  const diodes = loads.filter((c) => c.type === 'diode' || c.type === 'led');

  if (numNodes + sourceBranches.length === 0) return null;

  const diodeStates = new Map<string, { conducting: boolean; vDrop: number }>();
  for (const d of diodes) {
    const defaultVf = d.type === 'led' ? (d.forwardVoltage ?? 2.0) : (d.forwardVoltage ?? 0.7);
    diodeStates.set(d.id, { conducting: false, vDrop: defaultVf });
  }

  let solution: Phasor[] | null = null;
  const MAX_ITERS = 16;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const size = numNodes + sourceBranches.length;
    const G: Phasor[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ZERO),
    );
    const I: Phasor[] = Array.from({ length: size }, () => ZERO);

    for (const comp of loads) {
      const iA = nodeIndex.get(comp.nodeA);
      const iB = nodeIndex.get(comp.nodeB);
      if (iA === undefined && iB === undefined) continue;

      const isDiode = comp.type === 'diode' || comp.type === 'led';
      const y = isDiode
        ? diodeStates.get(comp.id)!.conducting
          ? cx(1) // forward: 1 Ω on-resistance
          : cx(1e-7) // reverse: blocking
        : admittanceOf(comp, omega, supplyVoltage);

      if (iA !== undefined) {
        G[iA][iA] = cAdd(G[iA][iA], y);
        if (iB !== undefined) G[iA][iB] = cSub(G[iA][iB], y);
        if (isDiode && diodeStates.get(comp.id)!.conducting) {
          I[iA] = cAdd(I[iA], cx(diodeStates.get(comp.id)!.vDrop));
        }
      }
      if (iB !== undefined) {
        G[iB][iB] = cAdd(G[iB][iB], y);
        if (iA !== undefined) G[iB][iA] = cSub(G[iB][iA], y);
        if (isDiode && diodeStates.get(comp.id)!.conducting) {
          I[iB] = cSub(I[iB], cx(diodeStates.get(comp.id)!.vDrop));
        }
      }
    }

    for (const vs of sourceBranches) {
      const idx = vsIndex.get(vs.id)!;
      const iA = nodeIndex.get(vs.nodeA);
      const iB = nodeIndex.get(vs.nodeB);

      if (iA !== undefined) {
        G[iA][idx] = cAdd(G[iA][idx], cx(1));
        G[idx][iA] = cAdd(G[idx][iA], cx(1));
      }
      if (iB !== undefined) {
        G[iB][idx] = cSub(G[iB][idx], cx(1));
        G[idx][iB] = cSub(G[idx][iB], cx(1));
      }

      // Only the sources running at this frequency drive the network; a DC
      // supply or a source of another frequency is a short at AC.
      const drives =
        vs.type === 'acVoltageSource' &&
        (vs.frequency ?? DEFAULT_AC_FREQUENCY) === frequency;
      I[idx] = cx(drives ? vs.value : 0);
    }

    const sol = solveComplexSystem(G, I);
    if (!sol) return null;
    solution = sol;

    if (diodes.length === 0) break;

    let changed = false;
    for (const d of diodes) {
      const state = diodeStates.get(d.id)!;
      const iA = nodeIndex.get(d.nodeA);
      const iB = nodeIndex.get(d.nodeB);
      const vA = iA !== undefined ? sol[iA] : ZERO;
      const vB = iB !== undefined ? sol[iB] : ZERO;
      // The instantaneous polarity decides conduction, so the in-phase part
      // of the phasor is what is compared against the forward drop.
      const vDiff = cSub(vA, vB).re;
      const shouldConduct = vDiff >= state.vDrop - 0.05;
      if (shouldConduct !== state.conducting) {
        state.conducting = shouldConduct;
        changed = true;
      }
    }
    if (!changed) break;
  }

  if (!solution) return null;

  const nodeVoltages = new Map<string, Phasor>();
  nodeVoltages.set(ground, ZERO);
  nodeList.forEach((node, i) => nodeVoltages.set(node.id, solution![i]));

  const branchCurrents = new Map<string, Phasor>();
  sourceBranches.forEach((vs, i) => branchCurrents.set(vs.id, solution![numNodes + i]));

  const voltage = new Map<string, Phasor>();
  const current = new Map<string, Phasor>();
  const power = new Map<string, number>();

  for (const comp of components) {
    const vA = comp.nodeA ? nodeVoltages.get(comp.nodeA) ?? ZERO : ZERO;
    const vB = comp.nodeB ? nodeVoltages.get(comp.nodeB) ?? ZERO : ZERO;
    const v = cSub(vA, vB);

    let i: Phasor;
    if (comp.voltageSource) {
      i = branchCurrents.get(comp.id) ?? ZERO;
    } else if (comp.currentSource) {
      // A DC current source holds a constant current: no AC component.
      i = ZERO;
    } else if (comp.type === 'diode' || comp.type === 'led') {
      const state = diodeStates.get(comp.id)!;
      i = state.conducting ? cScale(cSub(v, cx(state.vDrop)), 1) : cScale(v, 1e-7);
    } else {
      i = cMul(v, admittanceOf(comp, omega, supplyVoltage));
    }

    voltage.set(comp.id, v);
    current.set(comp.id, i);
    // Average real power: P = Re(V · I*)
    power.set(comp.id, cMul(v, cConj(i)).re);
  }

  return { frequency, nodeVoltages, voltage, current, power };
}
