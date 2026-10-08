/**
 * Time-domain circuit simulation engine.
 *
 * Architecture (as required by the spec):
 *
 *   CircuitDoc
 *     → buildTopology (geometry → nodes/branches)
 *     → instantaneousNetwork (per-timestep linearised network)
 *     → timestep integration (Backward Euler for L/C state)
 *     → SimulationSnapshot (time, node voltages, branch currents,
 *        component voltage/current/power, LED/diode state, capacitor V,
 *        inductor I, energy)
 *     → renderer reads snapshot (never the other way round)
 *
 * The electrical solver runs on a FIXED, small timestep (e.g. 100 µs),
 * independent of requestAnimationFrame. The renderer reads the latest
 * snapshot and may interpolate cosmetically, but never changes the
 * electrical calculation.
 */

import { DEFAULT_SOLENOID_INDUCTANCE, type CircuitDoc } from '../models/circuit';
import {
  type CircuitTopology,
  type ComponentInfo,
  type ComponentSolution,
  solveLinearSystem,
  lampResistance,
  isOpenAtDC,
  acInstantaneous,
} from './solver';

// ---------------------------------------------------------------------------
// Simulation clock + configuration
// ---------------------------------------------------------------------------

/** Fixed electrical timestep (seconds). Small enough to resolve 50–400 Hz
 * waveforms with many points per cycle and to keep Backward Euler stable. */
export const DEFAULT_DT = 1e-4; // 100 µs

/** Per-timestep snapshot consumed by every visual layer. */
export interface SimulationSnapshot {
  /** Simulation time in seconds. NOT Date.now(). */
  simTime: number;
  /** Node voltages at this instant (instantaneous, not RMS). */
  nodeVoltages: Map<string, number>;
  /** Component-level instantaneous solution. */
  componentData: Map<string, ComponentSolution>;
  /** Wire currents at this instant (conventional direction). */
  wireCurrents: Map<string, number>;
  /** Topology, for position lookups. */
  topology: CircuitTopology;
  /** Whether the snapshot represents a valid solve. */
  valid: boolean;
  /** Human-readable error, when invalid. */
  error: string | null;
  /** Runtime warnings (e.g. near-singular matrix). */
  warnings: string[];
}

/** Full simulation state, including stored energy state for L/C elements. */
export interface SimulationState {
  doc: CircuitDoc;
  topology: CircuitTopology | null;
  // Energy-storage state, indexed by component id
  capacitorVoltage: Map<string, number>; // Vc at terminal A relative to B
  inductorCurrent: Map<string, number>;  // I through the inductor
  // Running totals for the simulation clock
  simTime: number;
  status: 'stopped' | 'running' | 'paused';
  // The most recent snapshot — what every renderer reads
  snapshot: SimulationSnapshot | null;
  errors: string[];
  warnings: string[];
  // Optional hook the store/UI can use
  onSnapshot?: (snap: SimulationSnapshot) => void;
}

// ---------------------------------------------------------------------------
// Nonlinear element models
// ---------------------------------------------------------------------------

/** Diode/LED operating point used by the piecewise-linear model. */
export interface DiodeState {
  conducting: boolean;
  vDrop: number;
}

/** On-resistance of a conducting diode/LED in the PWL model (Ω). */
const DIODE_R_ON = 1.0;
/** Off-state conductance of a blocking diode (S) — 10 MΩ. */
const DIODE_G_OFF = 1e-7;

/**
 * Rated current of an LED (A). Brightness saturates at this current and
 * driving beyond it raises the overload flag.
 */
export const LED_RATED_CURRENT = 0.02; // 20 mA

/**
 * 0..1 emission intensity for a forward current. 0 mA → 0,
 * 2 mA → dim, 10 mA → mid, 20 mA → full brightness.
 * Reverse-leakage currents (µA) read as completely off.
 */
export function ledBrightness(current: number): number {
  const i = Math.abs(current);
  if (!Number.isFinite(i) || i < 1e-5) return 0; // < 10 µA: off
  return Math.min(1, i / LED_RATED_CURRENT);
}

/** Mechanical shaft speed (RPM) of a DC motor from its electrical
 * operating point. The shaft speed follows the electrical power
 * the motor actually absorbs: more power turns the shaft faster,
 * less power slows it, and with no supply (no voltage or no
 * current) the motor stops. */
export function motorRpm(voltage: number, current: number): number {
  const v = Math.abs(voltage);
  const i = Math.abs(current);
  if (!Number.isFinite(v) || !Number.isFinite(i)) return 0;
  if (v < 1e-6 || i < 1e-6) return 0; // no supply → the shaft stops
  const p = v * i;
  // A small 12 V / 10 Ω machine absorbs 14.4 W; map that to
  // a few thousand RPM, saturating for larger machines.
  const rpm = p * 200;
  return Number.isFinite(rpm) ? Math.min(6000, rpm) : 0;
}

// ---------------------------------------------------------------------------
// Instantaneous network builder
// ---------------------------------------------------------------------------

/** Linear (conductance) network for one instant in time.
 *
 * Energy-storage elements are modelled as nonlinear resistors whose
 * conductance is derived from the current state and the integration
 * method, so the instantaneous linear solve also advances state.
 *
 * Backward Euler for a capacitor:
 *   I = C·(Vn+1 − Vn)/dt  →  Geq = C/dt across the capacitor, with
 *   the previous voltage appearing as a current source C·Vn/dt.
 *
 * Backward Euler for an inductor:
 *   V = L·(In+1 − In)/dt  →  I(n+1) = (dt/L)·V(n+1) + In, i.e. a
 *   conductance Geq = dt/L with the previous current as a source.
 */
interface InstantaneousNetwork {
  /** Conductance matrix size: (non-ground nodes) + (voltage sources). */
  matrixSize: number;
  G: number[][];
  I: number[];
  nodeIndex: Map<string, number>;
  vsIndex: Map<string, number>;
  // Per-component instantaneous behaviour (diodes, AC sources, etc.)
  components: ComponentInfo[];
  topology: CircuitTopology;
  doc: CircuitDoc;
}

/** Guard against NaN/Inf poisoning the matrix. */
function safe(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Build the instantaneous conductance network for a given simulation
 * time and a GIVEN set of diode states. The caller iterates: build →
 * solve → update diode states → rebuild, so this function itself must
 * stay a pure stamp of the linearised network.
 *
 * AC sources contribute their instantaneous v(t) = Voffset +
 * Vpeak·sin(2πft + φ) with Vpeak = Vrms·√2.
 */
export function buildInstantaneousNetwork(
  doc: CircuitDoc,
  topology: CircuitTopology,
  t: number,
  state: SimulationState,
  dt: number,
  diodeStates: Map<string, DiodeState>,
): InstantaneousNetwork {
  const { nodes, components: topoComps, groundNode } = topology;

  // Determine effective ground
  const connectedNodeIds = new Set<string>();
  for (const c of topoComps) {
    if (c.nodeA) connectedNodeIds.add(c.nodeA);
    if (c.nodeB) connectedNodeIds.add(c.nodeB);
  }
  let effectiveGround = groundNode;
  if (!connectedNodeIds.has(effectiveGround) && connectedNodeIds.size > 0) {
    effectiveGround = connectedNodeIds.values().next().value!;
  }

  if (!effectiveGround || connectedNodeIds.size === 0) {
    // No connected circuit: return a degenerate network we can detect.
    return {
      matrixSize: 0,
      G: [],
      I: [],
      nodeIndex: new Map(),
      vsIndex: new Map(),
      components: topoComps,
      topology,
      doc,
    };
  }

  const nodeList = Array.from(nodes.values()).filter(
    (n) => n.id !== effectiveGround && connectedNodeIds.has(n.id),
  );
  const numNodes = nodeList.length;
  const voltageSources = topoComps.filter((c) => c.voltageSource);
  const currentSources = topoComps.filter((c) => c.currentSource);
  const numVS = voltageSources.length;
  const matrixSize = numNodes + numVS;

  const nodeIndex = new Map<string, number>();
  nodeList.forEach((node, i) => nodeIndex.set(node.id, i));

  const vsIndex = new Map<string, number>();
  voltageSources.forEach((vs, i) => vsIndex.set(vs.id, numNodes + i));

  const G = Array.from({ length: matrixSize }, () => new Array(matrixSize).fill(0));
  const I = new Array(matrixSize).fill(0);

  const comps = topoComps;
  const diodes = comps.filter((c) => c.type === 'diode' || c.type === 'led');
  const caps = comps.filter((c) => c.type === 'capacitor');
  const inds = comps.filter(
    (c) => c.type === 'solenoid' || c.type === 'dcMotor',
  );

  // ---- Linear passive components (resistors, lamps, motors' winding R) ----
  const linearResistors = comps.filter(
    (c) =>
      !c.voltageSource &&
      !c.currentSource &&
      !isOpenAtDC(c.type) &&
      c.type !== 'diode' &&
      c.type !== 'led' &&
      c.type !== 'capacitor' &&
      c.type !== 'solenoid' &&
      c.type !== 'dcMotor',
  );
  const supplyVoltage =
    doc.components.find((c) => c.type === 'battery' || c.type === 'acVoltageSource')
      ?.value ?? 0;
  for (const comp of linearResistors) {
    const r = comp.type === 'lamp' ? lampResistance(comp.value, supplyVoltage) : comp.value;
    const g =
      comp.type === 'lamp'
        ? Number.isFinite(r) && r > 0
          ? 1 / r
          : 0
        : comp.value > 0
          ? 1 / comp.value
          : 1e12;
    const iA = nodeIndex.get(comp.nodeA);
    const iB = nodeIndex.get(comp.nodeB);
    if (iA !== undefined) {
      G[iA][iA] += g;
      if (iB !== undefined) G[iA][iB] -= g;
    }
    if (iB !== undefined) {
      G[iB][iB] += g;
      if (iA !== undefined) G[iB][iA] -= g;
    }
  }

  // ---- Capacitors: Backward Euler companion ----
  // Geq = C/dt between the terminals; the previous voltage appears as a
  // current source injecting C·Vprev/dt into node A and out of node B.
  for (const comp of caps) {
    const cFarad = Math.max(comp.value, 0);
    if (cFarad <= 0 || dt <= 0) continue;
    const gEq = cFarad / dt;
    const vPrev = safe(state.capacitorVoltage.get(comp.id) ?? 0);
    const iA = nodeIndex.get(comp.nodeA);
    const iB = nodeIndex.get(comp.nodeB);
    if (iA === undefined && iB === undefined) continue;
    if (iA !== undefined) {
      G[iA][iA] += gEq;
      if (iB !== undefined) G[iA][iB] -= gEq;
      I[iA] += gEq * vPrev;
    }
    if (iB !== undefined) {
      G[iB][iB] += gEq;
      if (iA !== undefined) G[iB][iA] -= gEq;
      I[iB] -= gEq * vPrev;
    }
  }

  // ---- Inductors / DC motors: Backward Euler companion ----
  // The branch is R + L (winding/armature resistance in series
  // with the inductance). Backward Euler gives
  //   I(n+1) = [V(n+1) + (L/dt)·I(n)] / (R + L/dt)
  // which is a Norton companion: conductance
  //   Geq = 1 / (R + L/dt)
  // with a history current source
  //   Ihist = Geq · (L/dt) · I(n).
  // For a pure inductor (R = 0) this reduces to Geq = dt/L and
  // Ihist = I(n).
  for (const comp of inds) {
    const l = Math.max(comp.inductance ?? DEFAULT_SOLENOID_INDUCTANCE, 0);
    if (l <= 0 || dt <= 0) continue;
    const r = comp.value > 0 ? comp.value : 0;
    const lOverDt = l / dt;
    const gEq = 1 / (r + lOverDt);
    const iPrev = safe(state.inductorCurrent.get(comp.id) ?? 0);
    const iHist = gEq * lOverDt * iPrev;
    const iA = nodeIndex.get(comp.nodeA);
    const iB = nodeIndex.get(comp.nodeB);
    if (iA === undefined && iB === undefined) continue;
    if (iA !== undefined) {
      G[iA][iA] += gEq;
      if (iB !== undefined) G[iA][iB] -= gEq;
      I[iA] += iHist;
    }
    if (iB !== undefined) {
      G[iB][iB] += gEq;
      if (iA !== undefined) G[iB][iA] -= gEq;
      I[iB] -= iHist;
    }
  }

  // ---- Diodes / LEDs: piecewise-linear, state supplied by the caller ----
  for (const d of diodes) {
    const st = diodeStates.get(d.id) ?? {
      conducting: false,
      vDrop: d.type === 'led' ? (d.forwardVoltage ?? 2.0) : (d.forwardVoltage ?? 0.7),
    };
    const iA = nodeIndex.get(d.nodeA);
    const iB = nodeIndex.get(d.nodeB);
    if (iA === undefined && iB === undefined) continue;
    if (st.conducting) {
      const gOn = 1 / DIODE_R_ON;
      if (iA !== undefined) {
        G[iA][iA] += gOn;
        if (iB !== undefined) G[iA][iB] -= gOn;
        I[iA] += gOn * st.vDrop;
      }
      if (iB !== undefined) {
        G[iB][iB] += gOn;
        if (iA !== undefined) G[iB][iA] -= gOn;
        I[iB] -= gOn * st.vDrop;
      }
    } else {
      if (iA !== undefined) {
        G[iA][iA] += DIODE_G_OFF;
        if (iB !== undefined) G[iA][iB] -= DIODE_G_OFF;
      }
      if (iB !== undefined) {
        G[iB][iB] += DIODE_G_OFF;
        if (iA !== undefined) G[iB][iA] -= DIODE_G_OFF;
      }
    }
  }

  // ---- Current sources ----
  for (const cs of currentSources) {
    const iA = nodeIndex.get(cs.nodeA);
    const iB = nodeIndex.get(cs.nodeB);
    if (iA !== undefined) I[iA] -= safe(cs.value);
    if (iB !== undefined) I[iB] += safe(cs.value);
  }

  // ---- Voltage sources: DC battery + instantaneous AC ----
  for (const vs of voltageSources) {
    const idx = vsIndex.get(vs.id)!;
    const iA = nodeIndex.get(vs.nodeA);
    const iB = nodeIndex.get(vs.nodeB);
    if (iA !== undefined) {
      G[iA][idx] += 1;
      G[idx][iA] += 1;
    }
    if (iB !== undefined) {
      G[iB][idx] -= 1;
      G[idx][iB] -= 1;
    }

    let vInstant = safe(vs.value); // DC battery
    if (vs.type === 'acVoltageSource') {
      const freq = vs.frequency ?? 50;
      const phaseRad = ((vs.phaseDeg ?? 0) * Math.PI) / 180;
      const offset = safe(vs.offset ?? 0);
      vInstant = acInstantaneous(vs.value, freq, phaseRad, offset, t);
    }
    I[idx] = safe(vInstant);
  }

  return {
    matrixSize,
    G,
    I,
    nodeIndex,
    vsIndex,
    components: comps,
    topology,
    doc,
  };
}

// ---------------------------------------------------------------------------
// Solve one timestep and produce a snapshot
// ---------------------------------------------------------------------------

/** Initial diode states: blocking, with the model's forward drop. */
function initialDiodeStates(
  topology: CircuitTopology,
  prevSnapshot: SimulationSnapshot | null,
): Map<string, DiodeState> {
  const states = new Map<string, DiodeState>();
  for (const c of topology.components) {
    if (c.type !== 'diode' && c.type !== 'led') continue;
    const vDrop =
      c.type === 'led' ? (c.forwardVoltage ?? 2.0) : (c.forwardVoltage ?? 0.7);
    states.set(c.id, { conducting: false, vDrop });
  }
  // Warm start from the previous instant: a diode carrying current a
  // moment ago is a good first guess (it keeps AC convergence snappy).
  if (prevSnapshot) {
    for (const c of topology.components) {
      if (c.type !== 'diode' && c.type !== 'led') continue;
      const prevSol = prevSnapshot.componentData.get(c.id);
      const st = states.get(c.id);
      if (prevSol && st && prevSol.current > 1e-4) st.conducting = true;
    }
  }
  return states;
}

/** Solve the instantaneous network, advance L/C state, and return a
 * snapshot. Mutates `state`: the capacitor voltages, inductor currents
 * and the simulation clock all advance by exactly one `dt`. */
export function stepSimulation(
  doc: CircuitDoc,
  topology: CircuitTopology,
  state: SimulationState,
  dt: number,
): SimulationSnapshot {
  // ---- advance the independent simulation clock ----
  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : DEFAULT_DT;
  state.simTime = safe(state.simTime, 0) + safeDt;
  const t = state.simTime;

  const emptySnap = (): SimulationSnapshot => ({
    simTime: t,
    nodeVoltages: new Map([[topology.groundNode, 0]]),
    componentData: new Map(),
    wireCurrents: new Map(),
    topology,
    valid: true,
    error: null,
    warnings: [],
  });

  // If there's no connected circuit, produce a "valid but empty" snapshot.
  const connectedNodeIds = new Set<string>();
  for (const c of topology.components) {
    if (c.nodeA) connectedNodeIds.add(c.nodeA);
    if (c.nodeB) connectedNodeIds.add(c.nodeB);
  }
  if (connectedNodeIds.size === 0) return emptySnap();

  // ---- diode fixed-point iteration: guess → solve → update → repeat ----
  const diodeStates = initialDiodeStates(topology, state.snapshot);
  const diodes = topology.components.filter(
    (c) => c.type === 'diode' || c.type === 'led',
  );

  const MAX_DIODE_ITERS = 12;
  let net = buildInstantaneousNetwork(doc, topology, t, state, safeDt, diodeStates);
  if (net.matrixSize === 0) return emptySnap();

  let sol: number[] | null = null;
  for (let iter = 0; iter <= MAX_DIODE_ITERS; iter++) {
    const s = solveLinearSystem(net.G, net.I);
    if (!s) {
      sol = null;
      break;
    }
    sol = s;
    if (diodes.length === 0) break;

    let changed = false;
    for (const d of diodes) {
      const st = diodeStates.get(d.id)!;
      const iA = net.nodeIndex.get(d.nodeA);
      const iB = net.nodeIndex.get(d.nodeB);
      const vA = iA !== undefined ? safe(sol[iA]) : 0;
      const vB = iB !== undefined ? safe(sol[iB]) : 0;
      const vDiff = vA - vB;
      const shouldConduct = vDiff >= st.vDrop - 0.05;
      if (shouldConduct !== st.conducting) {
        st.conducting = shouldConduct;
        changed = true;
      }
    }
    if (!changed) break;
    net = buildInstantaneousNetwork(doc, topology, t, state, safeDt, diodeStates);
  }

  if (!sol) {
    return {
      simTime: t,
      nodeVoltages: new Map(),
      componentData: new Map(),
      wireCurrents: new Map(),
      topology,
      valid: false,
      error: 'Singular matrix — circuit may be incomplete or over-constrained',
      warnings: [],
    };
  }

  // ---- node voltages ----
  const nodeVoltages = new Map<string, number>();
  nodeVoltages.set(topology.groundNode, 0);
  const nodeList = Array.from(topology.nodes.values()).filter(
    (n) => n.id !== topology.groundNode,
  );
  nodeList.forEach((node, i) => {
    if (i < sol!.length) nodeVoltages.set(node.id, safe(sol![i]));
  });

  // ---- branch currents through voltage sources ----
  const branchCurrents = new Map<string, number>();
  const voltageSources = topology.components.filter((c) => c.voltageSource);
  voltageSources.forEach((vs) => {
    const idx = net.vsIndex.get(vs.id)!;
    branchCurrents.set(vs.id, safe(sol![idx]));
  });

  // ---- per-component instantaneous solution ----
  const componentData = new Map<string, ComponentSolution>();
  const supplyVoltage =
    doc.components.find((c) => c.type === 'battery' || c.type === 'acVoltageSource')
      ?.value ?? 0;

  for (const comp of net.components) {
    const iA = net.nodeIndex.get(comp.nodeA);
    const iB = net.nodeIndex.get(comp.nodeB);
    const vA = iA !== undefined ? safe(sol![iA]) : 0;
    const vB = iB !== undefined ? safe(sol![iB]) : 0;
    const voltage = vA - vB;

    let current = 0;
    if (comp.voltageSource) {
      current = branchCurrents.get(comp.id) ?? 0;
    } else if (comp.currentSource) {
      current = safe(comp.value);
    } else if (comp.type === 'capacitor') {
      // I = C·dV/dt with the Backward-Euler endpoint voltages
      const cFarad = Math.max(comp.value, 0);
      const vPrev = safe(state.capacitorVoltage.get(comp.id) ?? 0);
      current =
        cFarad > 0 && safeDt > 0
          ? (cFarad * (voltage - vPrev)) / safeDt
          : 0;
    } else if (comp.type === 'solenoid' || comp.type === 'dcMotor') {
      // Inductor companion current: I(n+1) = [V(n+1) + (L/dt)·I(n)] / (R + L/dt)
      const l = Math.max(comp.inductance ?? DEFAULT_SOLENOID_INDUCTANCE, 0);
      const r = comp.value > 0 ? comp.value : 0;
      const iPrev = safe(state.inductorCurrent.get(comp.id) ?? 0);
      if (l > 0 && safeDt > 0) {
        const lOverDt = l / safeDt;
        const gEq = 1 / (r + lOverDt);
        current = gEq * voltage + gEq * lOverDt * iPrev;
      } else {
        current = r > 0 ? voltage / r : 0;
      }
    } else if (comp.type === 'diode' || comp.type === 'led') {
      const st = diodeStates.get(comp.id)!;
      current = st.conducting
        ? Math.max(0, (voltage - st.vDrop) / DIODE_R_ON)
        : voltage * DIODE_G_OFF;
    } else if (comp.type === 'lamp') {
      const r = lampResistance(comp.value, supplyVoltage);
      current = Number.isFinite(r) && r > 0 ? voltage / r : 0;
    } else {
      const r = comp.value > 0 ? comp.value : 1e12;
      current = voltage / r;
    }

    current = safe(current);

    // ---- derived electrical state ----
    const power = voltage * current;
    const solution: ComponentSolution = {
      voltage,
      current,
      power,
      currentDirection: current >= 0 ? 1 : -1,
    };

    // Mechanical + optical state derived from the electrical solution,
    // never from a timer.
    if (comp.type === 'dcMotor') {
      solution.rpm = motorRpm(voltage, current);
    }
    if (comp.type === 'led') {
      solution.brightness = ledBrightness(current);
      solution.overload = Math.abs(current) > LED_RATED_CURRENT * 1.05;
    }

    componentData.set(comp.id, solution);
  }

  // ---- advance energy-storage state (Backward Euler) ----
  const newCapVoltages = new Map(state.capacitorVoltage);
  for (const comp of net.components) {
    if (comp.type !== 'capacitor') continue;
    const cFarad = Math.max(comp.value, 0);
    if (cFarad <= 0 || safeDt <= 0) continue;
    const prev = safe(state.capacitorVoltage.get(comp.id) ?? 0);
    const current = safe(componentData.get(comp.id)?.current ?? 0);
    // V(n+1) = V(n) + I·dt/C — identical to the solved endpoint voltage
    // by construction of the companion model, but integrating explicitly
    // keeps the state self-consistent even if the solve was iterative.
    let vNew = prev + (current * safeDt) / cFarad;
    if (!Number.isFinite(vNew)) vNew = prev;
    // Clamp to keep extreme fault conditions from exploding the sim.
    if (Math.abs(vNew) > 1e6) vNew = Math.sign(vNew) * 1e6;
    newCapVoltages.set(comp.id, vNew);
  }
  state.capacitorVoltage = newCapVoltages;

  const newIndCurrents = new Map(state.inductorCurrent);
  for (const comp of net.components) {
    if (comp.type !== 'solenoid' && comp.type !== 'dcMotor') continue;
    const l = Math.max(comp.inductance ?? DEFAULT_SOLENOID_INDUCTANCE, 0);
    if (l <= 0 || safeDt <= 0) continue;
    const r = comp.value > 0 ? comp.value : 0;
    const prev = safe(state.inductorCurrent.get(comp.id) ?? 0);
    const voltage = safe(componentData.get(comp.id)?.voltage ?? 0);
    // Backward Euler: I(n+1) = [V(n+1) + (L/dt)·I(n)] / (R + L/dt)
    const lOverDt = l / safeDt;
    const gEq = 1 / (r + lOverDt);
    let iNew = gEq * voltage + gEq * lOverDt * prev;
    if (!Number.isFinite(iNew)) iNew = prev;
    if (Math.abs(iNew) > 1e6) iNew = Math.sign(iNew) * 1e6;
    newIndCurrents.set(comp.id, iNew);
  }
  state.inductorCurrent = newIndCurrents;

  // ---- wire currents via KCL ----
  const wireCurrents = computeWireCurrents(doc, topology, componentData);

  const warnings: string[] = [];
  if (state.simTime > 1e6) warnings.push('Simulation time unusually large');

  return {
    simTime: t,
    nodeVoltages,
    componentData,
    wireCurrents,
    topology,
    valid: true,
    error: null,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Wire currents (reused from solver)
// ---------------------------------------------------------------------------

function computeWireCurrents(
  doc: CircuitDoc,
  topology: CircuitTopology,
  compData: Map<string, ComponentSolution>,
): Map<string, number> {
  const wireCurrents = new Map<string, number>();

  const termNode = new Map<string, string>();
  for (const comp of topology.components) {
    if (comp.nodeA) termNode.set(`${comp.id}:0`, comp.nodeA);
    if (comp.nodeB) termNode.set(`${comp.id}:1`, comp.nodeB);
  }

  for (const wire of doc.wires) {
    let current = 0;
    let found = false;

    const startKey = wire.start.componentId
      ? `${wire.start.componentId}:${wire.start.terminalIndex}`
      : null;
    const endKey = wire.end.componentId
      ? `${wire.end.componentId}:${wire.end.terminalIndex}`
      : null;

    if (startKey && termNode.has(startKey)) {
      const sol = compData.get(wire.start.componentId!);
      if (sol) {
        current =
          wire.start.terminalIndex === 0
            ? sol.current * sol.currentDirection
            : -sol.current * sol.currentDirection;
        found = true;
      }
    }

    if (!found && endKey && termNode.has(endKey)) {
      const sol = compData.get(wire.end.componentId!);
      if (sol) {
        current =
          wire.end.terminalIndex === 0
            ? -sol.current * sol.currentDirection
            : sol.current * sol.currentDirection;
        found = true;
      }
    }

    if (!found) {
      // Average of both ends when both are attached
      let sCur = 0;
      let eCur = 0;
      if (startKey && termNode.has(startKey)) {
        const sol = compData.get(wire.start.componentId!);
        if (sol)
          sCur =
            wire.start.terminalIndex === 0
              ? sol.current * sol.currentDirection
              : -sol.current * sol.currentDirection;
      }
      if (endKey && termNode.has(endKey)) {
        const sol = compData.get(wire.end.componentId!);
        if (sol)
          eCur =
            wire.end.terminalIndex === 0
              ? -sol.current * sol.currentDirection
              : sol.current * sol.currentDirection;
      }
      if (sCur !== 0 || eCur !== 0) {
        current = (sCur + eCur) / 2;
        found = true;
      }
    }

    wireCurrents.set(wire.id, safe(current));
  }

  return wireCurrents;
}
