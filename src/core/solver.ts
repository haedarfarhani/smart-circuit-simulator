import { DEFAULT_SOLENOID_INDUCTANCE } from '../models/circuit';
import type { CircuitDoc, ComponentType, Wire } from '../models/circuit';

/**
 * Instantaneous AC voltage from a real sinusoidal source.
 *
 * v(t) = Voffset + Vpeak·sin(2π·f·t + φ)
 *
 * The UI expresses the source in RMS, so Vpeak = Vrms·√2. A 12 Vrms,
 * 50 Hz source therefore swings between about ±16.97 V, not ±12 V.
 */
export function acInstantaneous(
  vrms: number,
  frequencyHz: number,
  phaseRad: number,
  offsetV: number,
  t: number,
): number {
  const peak = vrms * Math.SQRT2;
  return offsetV + peak * Math.sin(2 * Math.PI * frequencyHz * t + phaseRad);
}

export function acPeakFromRms(vrms: number): number {
  return vrms * Math.SQRT2;
}

import { terminalWorld } from './geometry';
import { resolveEnd } from './wirePath';
import { acFrequencies, hasAcSource, phasorAngle, phasorMag, solveAcSteadyState } from './acSolver';
import type { AcSolution } from './acSolver';

export interface SolverResult {
  nodeVoltages: Map<string, number>;
  branchCurrents: Map<string, number>;
  componentData: Map<string, ComponentSolution>;
  wireCurrents: Map<string, number>;
  isValid: boolean;
  error?: string;
  /** set when the circuit was solved in the frequency domain */
  frequencies?: number[];
}

export interface ComponentSolution {
  voltage: number;
  current: number;
  power: number;
  currentDirection: number;
  /** true when the readouts are RMS values combined with the DC operating point */
  ac?: boolean;
  /** source frequency behind the AC part, when there is exactly one */
  frequency?: number;
  /** phase angle of the voltage phasor, in radians */
  phase?: number;
  /**
   * Mechanical shaft speed of a motor, in RPM, derived from the
   * electrical operating point (time-domain snapshot only).
   */
  rpm?: number;
  /** 0..1 emission intensity of an LED, derived from forward current */
  brightness?: number;
  /** true when an LED is driven beyond its rated current */
  overload?: boolean;
}

export interface CircuitTopology {
  nodes: Map<string, NodeInfo>;
  components: ComponentInfo[];
  groundNode: string;
  /** grid key → node id, for every connection point of the circuit */
  nodeByKey: Map<string, string>;
}

export interface NodeInfo {
  id: string;
  x: number;
  y: number;
  connectedComponents: string[];
}

export interface ComponentInfo {
  id: string;
  type: ComponentType;
  value: number;
  nodeA: string;
  nodeB: string;
  voltageSource: boolean;
  currentSource: boolean;
  frequency?: number;
  /** phase angle in degrees (AC sources) */
  phaseDeg?: number;
  /** DC offset in volts (AC sources) */
  offset?: number;
  color?: string;
  forwardVoltage?: number;
  /** coil inductance in henries, for components that store energy magnetically */
  inductance?: number;
}

const GRID = 10;
const nodeKey = (x: number, y: number): string =>
  `${Math.round(x / GRID) * GRID},${Math.round(y / GRID) * GRID}`;

/**
 * At DC a capacitor blocks: no current flows through it and its two terminals
 * stay on separate nodes. It only matters for the charge / energy display.
 */
export function isOpenAtDC(type: ComponentType): boolean {
  return type === 'capacitor';
}

/**
 * Resistance of a lamp, in ohms.
 *
 * A lamp's value is its watt rating (SYMBOLS.lamp.unit is 'W' and the analyzer
 * compares `power` against it), so its resistance follows from the supply it is
 * rated for: R = V²/P. That is the usual “bulb rated at this voltage”
 * assumption and it makes the brightness readout meaningful: a lamp sitting
 * straight across the supply burns at its rated power.
 *
 * A lamp with no usable rating blocks, so it makes no light at all.
 */
export function lampResistance(ratedPower: number, supplyVoltage: number): number {
  if (!Number.isFinite(ratedPower) || ratedPower <= 0) return Infinity;
  if (!Number.isFinite(supplyVoltage) || supplyVoltage <= 0) return ratedPower;
  return (supplyVoltage * supplyVoltage) / ratedPower;
}

class UnionFind {
  private parent: Map<string, string> = new Map();
  private pos: Map<string, { x: number; y: number }> = new Map();

  find(k: string): string {
    const p = this.parent.get(k);
    if (!p || p === k) return k;
    const root = this.find(p);
    this.parent.set(k, root);
    return root;
  }

  ensure(x: number, y: number): string {
    const k = nodeKey(x, y);
    if (!this.parent.has(k)) {
      this.parent.set(k, k);
      this.pos.set(k, { x: Math.round(x), y: Math.round(y) });
    }
    return k;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  getPositions(): Map<string, { x: number; y: number }> {
    return this.pos;
  }
}

export function buildTopology(doc: CircuitDoc): CircuitTopology {
  const uf = new UnionFind();
  const nodes = new Map<string, NodeInfo>();
  const components: ComponentInfo[] = [];
  let groundNode = '';
  let nodeCounter = 0;

  for (const comp of doc.components) {
    const t0 = terminalWorld(comp, 0);
    uf.ensure(t0.x, t0.y);
    if (comp.type !== 'ground') {
      const t1 = terminalWorld(comp, 1);
      uf.ensure(t1.x, t1.y);
    }
  }

  const wireKeys = new Set<string>();
  for (const wire of doc.wires) {
    const s = resolveEnd(doc, wire.start);
    const e = resolveEnd(doc, wire.end);
    if (!s || !e) continue;
    const sk = uf.ensure(s.x, s.y);
    const ek = uf.ensure(e.x, e.y);
    wireKeys.add(sk);
    wireKeys.add(ek);
    uf.union(sk, ek);
    if (wire.waypoints.length > 0) {
      let prev = sk;
      for (const wp of wire.waypoints) {
        const wk = uf.ensure(wp.x, wp.y);
        wireKeys.add(wk);
        uf.union(prev, wk);
        prev = wk;
      }
      uf.union(prev, ek);
    }
  }

  const pos = uf.getPositions();
  const nodeIds = new Map<string, string>();

  // Only assign node IDs to roots that are actually connected to at least one component or wire
  for (const [k, p] of pos) {
    const root = uf.find(k);
    if (!nodeIds.has(root)) {
      const nodeId = `n${nodeCounter++}`;
      nodeIds.set(root, nodeId);
      nodes.set(nodeId, { id: nodeId, x: p.x, y: p.y, connectedComponents: [] });
    }
  }

  const keyToNode = new Map<string, string>();
  for (const k of pos.keys()) {
    const root = uf.find(k);
    keyToNode.set(k, nodeIds.get(root)!);
  }

  for (const comp of doc.components) {
    const t0 = terminalWorld(comp, 0);
    const k0 = nodeKey(t0.x, t0.y);
    const nodeId0 = keyToNode.get(k0);

    if (comp.type === 'ground') {
      if (nodeId0) {
        groundNode = nodeId0;
        nodes.get(nodeId0)!.connectedComponents.push(comp.id);
      }
      continue;
    }

    const t1 = terminalWorld(comp, 1);
    const k1 = nodeKey(t1.x, t1.y);
    const nodeId1 = keyToNode.get(k1);

    const nodeA = nodeId0 ?? '';
    const nodeB = nodeId1 ?? '';
    if (nodeA) nodes.get(nodeA)!.connectedComponents.push(comp.id);
    if (nodeB) nodes.get(nodeB)!.connectedComponents.push(comp.id);

    const isVoltageSource = comp.type === 'battery' || comp.type === 'acVoltageSource';
    const isCurrentSource = comp.type === 'currentSource';
    components.push({
      id: comp.id,
      type: comp.type,
      value: comp.value,
      nodeA,
      nodeB,
      voltageSource: isVoltageSource,
      currentSource: isCurrentSource,
      frequency: comp.frequency,
      phaseDeg: comp.phaseDeg,
      offset: comp.offset,
      color: comp.color,
      forwardVoltage: comp.forwardVoltage,
      inductance:
        comp.inductance ?? (comp.type === 'solenoid' ? DEFAULT_SOLENOID_INDUCTANCE : undefined),
    });
  }

  // Prune islands no component can reach, keeping every node that carries a
  // wire: connectivity on its own is still meaningful when a document is
  // inspected before anything is placed on it.
  const rootByNodeId = new Map<string, string>();
  for (const [root, nodeId] of nodeIds) rootByNodeId.set(nodeId, root);
  const wireRoots = new Set<string>();
  for (const k of wireKeys) wireRoots.add(uf.find(k));

  for (const [id, node] of nodes) {
    if (node.connectedComponents.length === 0 && !wireRoots.has(rootByNodeId.get(id)!)) {
      nodes.delete(id);
    }
  }

  if ((!groundNode || !nodes.has(groundNode)) && nodes.size > 0) {
    const firstNode = nodes.values().next().value;
    if (firstNode) groundNode = firstNode.id;
  }

  return { nodes, components, groundNode, nodeByKey: keyToNode };
}

function solveDC(
  doc: CircuitDoc,
  topology: CircuitTopology,
  /** sources forced to 0 V — the AC part of a superposition solve */
  zeroSourceIds?: Set<string>,
): SolverResult {
  const { nodes, components, groundNode } = topology;
  // lamps are rated against the supply they are connected to
  const supplyVoltage =
    doc.components.find((c) => c.type === 'battery' || c.type === 'acVoltageSource')?.value ?? 0;
  const resistanceOf = (comp: ComponentInfo): number => {
    if (comp.type === 'lamp') return lampResistance(comp.value, supplyVoltage);
    if (comp.type === 'acMotor') return comp.value > 0 ? comp.value : 15;
    return comp.value;
  };

  // Only include nodes that are actually connected to components
  const connectedNodeIds = new Set<string>();
  for (const c of components) {
    if (c.nodeA) connectedNodeIds.add(c.nodeA);
    if (c.nodeB) connectedNodeIds.add(c.nodeB);
  }

  // Pick an active ground node if existing groundNode has no components
  let effectiveGround = groundNode;
  if (!connectedNodeIds.has(effectiveGround) && connectedNodeIds.size > 0) {
    effectiveGround = connectedNodeIds.values().next().value!;
  }

  if (!effectiveGround || connectedNodeIds.size === 0) {
    return {
      nodeVoltages: new Map(),
      branchCurrents: new Map(),
      componentData: new Map(),
      wireCurrents: new Map(),
      isValid: false,
      error: 'No connected circuit components found',
    };
  }

  const nodeList = Array.from(nodes.values()).filter(
    (n) => n.id !== effectiveGround && connectedNodeIds.has(n.id),
  );
  const voltageSources = components.filter((c) => c.voltageSource);
  const currentSources = components.filter((c) => c.currentSource);

  // Capacitors are open at DC
  const linearResistors = components.filter(
    (c) =>
      !c.voltageSource &&
      !c.currentSource &&
      !isOpenAtDC(c.type) &&
      c.type !== 'diode' &&
      c.type !== 'led',
  );
  const diodes = components.filter((c) => c.type === 'diode' || c.type === 'led');

  const numNodes = nodeList.length;
  const numVoltageSources = voltageSources.length;
  const matrixSize = numNodes + numVoltageSources;

  if (matrixSize === 0) {
    return {
      nodeVoltages: new Map([[groundNode, 0]]),
      branchCurrents: new Map(),
      componentData: new Map(),
      wireCurrents: new Map(),
      isValid: true,
    };
  }

  const nodeIndex = new Map<string, number>();
  nodeList.forEach((node, i) => nodeIndex.set(node.id, i));

  const vsIndex = new Map<string, number>();
  voltageSources.forEach((vs, i) => vsIndex.set(vs.id, numNodes + i));

  // Iterative solver for non-linear diodes (up to 20 iterations)
  // Initially assume all diodes are OFF
  const diodeStates = new Map<string, { conducting: boolean; vDrop: number }>();
  for (const d of diodes) {
    const defaultVf = d.type === 'led' ? (d.forwardVoltage ?? 2.0) : (d.forwardVoltage ?? 0.7);
    diodeStates.set(d.id, { conducting: false, vDrop: defaultVf });
  }

  let finalSolution: number[] | null = null;
  const MAX_ITERS = 16;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const G = new Array(matrixSize).fill(0).map(() => new Array(matrixSize).fill(0));
    const I = new Array(matrixSize).fill(0);

    // Linear components
    for (const comp of linearResistors) {
      const r = resistanceOf(comp);
      const g = comp.type === 'lamp'
        ? (Number.isFinite(r) && r > 0 ? 1 / r : 0)
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

    // Diodes & LEDs PWL approximation
    for (const d of diodes) {
      const state = diodeStates.get(d.id)!;
      const iA = nodeIndex.get(d.nodeA); // Anode
      const iB = nodeIndex.get(d.nodeB); // Cathode

      if (state.conducting) {
        // Conducts with small series resistance (e.g. 1 Ω) and threshold current offset
        const rOn = 1.0;
        const gOn = 1 / rOn;
        if (iA !== undefined) {
          G[iA][iA] += gOn;
          if (iB !== undefined) G[iA][iB] -= gOn;
          I[iA] += gOn * state.vDrop;
        }
        if (iB !== undefined) {
          G[iB][iB] += gOn;
          if (iA !== undefined) G[iB][iA] -= gOn;
          I[iB] -= gOn * state.vDrop;
        }
      } else {
        // Reverse biased: very high resistance (10 MΩ)
        const gOff = 1e-7;
        if (iA !== undefined) {
          G[iA][iA] += gOff;
          if (iB !== undefined) G[iA][iB] -= gOff;
        }
        if (iB !== undefined) {
          G[iB][iB] += gOff;
          if (iA !== undefined) G[iB][iA] -= gOff;
        }
      }
    }

    // Independent Current Sources (Terminal 0 = Anode/In, Terminal 1 = Cathode/Out)
    for (const cs of currentSources) {
      const val = cs.value; // Current flows from nodeA to nodeB
      const iA = nodeIndex.get(cs.nodeA);
      const iB = nodeIndex.get(cs.nodeB);
      if (iA !== undefined) I[iA] -= val;
      if (iB !== undefined) I[iB] += val;
    }

    // Voltage Sources
    for (const vs of voltageSources) {
      const vsIdx = vsIndex.get(vs.id)!;
      const iA = nodeIndex.get(vs.nodeA);
      const iB = nodeIndex.get(vs.nodeB);

      if (iA !== undefined) G[iA][vsIdx] = 1;
      if (iB !== undefined) G[iB][vsIdx] = -1;
      if (iA !== undefined) G[vsIdx][iA] = 1;
      if (iB !== undefined) G[vsIdx][iB] = -1;
      I[vsIdx] = zeroSourceIds?.has(vs.id) ? 0 : vs.value;
    }

    const sol = solveLinearSystem(G, I);
    if (!sol) break;
    finalSolution = sol;

    if (diodes.length === 0) break;

    // Check diode state convergence
    let changed = false;
    for (const d of diodes) {
      const state = diodeStates.get(d.id)!;
      const iA = nodeIndex.get(d.nodeA);
      const iB = nodeIndex.get(d.nodeB);
      const vA = iA !== undefined ? sol[iA] : 0;
      const vB = iB !== undefined ? sol[iB] : 0;
      const vDiff = vA - vB;
      const shouldConduct = vDiff >= state.vDrop - 0.05;

      if (shouldConduct !== state.conducting) {
        state.conducting = shouldConduct;
        changed = true;
      }
    }

    if (!changed) break;
  }

  if (!finalSolution) {
    return {
      nodeVoltages: new Map(),
      branchCurrents: new Map(),
      componentData: new Map(),
      wireCurrents: new Map(),
      isValid: false,
      error: 'Singular matrix - circuit may be incomplete',
    };
  }

  const solution = finalSolution;
  const nodeVoltages = new Map<string, number>();
  nodeVoltages.set(effectiveGround, 0);
  nodeList.forEach((node, i) => nodeVoltages.set(node.id, solution[i]));

  const branchCurrents = new Map<string, number>();
  voltageSources.forEach((vs, i) => {
    branchCurrents.set(vs.id, solution[numNodes + i]);
  });

  const componentData = new Map<string, ComponentSolution>();
  for (const comp of components) {
    const vA = nodeVoltages.get(comp.nodeA) ?? 0;
    const vB = nodeVoltages.get(comp.nodeB) ?? 0;
    const voltage = vA - vB;

    let current = 0;
    if (comp.voltageSource) {
      current = branchCurrents.get(comp.id) ?? 0;
    } else if (comp.currentSource) {
      current = comp.value;
    } else if (isOpenAtDC(comp.type)) {
      current = 0;
    } else if (comp.type === 'diode' || comp.type === 'led') {
      const dState = diodeStates.get(comp.id);
      if (dState && dState.conducting) {
        current = Math.max(0, (voltage - dState.vDrop) / 1.0);
      } else {
        current = voltage * 1e-7;
      }
    } else if (comp.type === 'lamp') {
      const r = resistanceOf(comp);
      current = Number.isFinite(r) && r > 0 ? voltage / r : 0;
    } else {
      const r = resistanceOf(comp);
      const g = r > 0 ? 1 / r : 0;
      current = voltage * g;
    }

    const power = voltage * current;
    componentData.set(comp.id, {
      voltage,
      current,
      power,
      currentDirection: current >= 0 ? 1 : -1,
    });
  }

  const wireCurrents = computeWireCurrents(doc, topology, componentData);

  return {
    nodeVoltages,
    branchCurrents,
    componentData,
    wireCurrents,
    isValid: true,
  };
}

/**
 * Compute the current through each wire using KCL at every node.
 * At each node, the sum of currents from connected components (leaving the
 * node) must equal the sum of currents in wires leaving the node.
 */
function computeWireCurrents(
  doc: CircuitDoc,
  topology: CircuitTopology,
  compData: Map<string, ComponentSolution>,
): Map<string, number> {
  const { components } = topology;
  const wireCurrents = new Map<string, number>();

  const termNode = new Map<string, string>();
  for (const comp of components) {
    if (comp.nodeA) termNode.set(`${comp.id}:0`, comp.nodeA);
    if (comp.nodeB) termNode.set(`${comp.id}:1`, comp.nodeB);
  }
  // Map ground terminal
  for (const comp of doc.components) {
    if (comp.type === 'ground') {
      const t = terminalWorld(comp, 0);
      const root = findNodeKey(topology, t.x, t.y);
      if (root) termNode.set(`${comp.id}:0`, root);
    }
  }

  const nodeToWires = new Map<string, Wire[]>();
  for (const wire of doc.wires) {
    const s = resolveEnd(doc, wire.start);
    const e = resolveEnd(doc, wire.end);
    if (!s || !e) continue;

    const sk = findNodeKey(topology, s.x, s.y);
    const ek = findNodeKey(topology, e.x, e.y);
    if (sk) {
      if (!nodeToWires.has(sk)) nodeToWires.set(sk, []);
      nodeToWires.get(sk)!.push(wire);
    }
    if (ek) {
      if (!nodeToWires.has(ek)) nodeToWires.set(ek, []);
      nodeToWires.get(ek)!.push(wire);
    }
  }

  for (const wire of doc.wires) {
    let current = 0;
    let found = false;

    if (wire.start.componentId && found === false) {
      const key = `${wire.start.componentId}:${wire.start.terminalIndex}`;
      const nodeId = termNode.get(key);
      if (nodeId) {
        const comp = doc.components.find((c) => c.id === wire.start.componentId);
        const sol = compData.get(wire.start.componentId);
        if (sol && comp) {
          const termIdx = wire.start.terminalIndex;
          const compSol = sol;
          current =
            termIdx === 0
              ? compSol.current * compSol.currentDirection
              : -compSol.current * compSol.currentDirection;
          found = true;
        }
      }
    }

    if (wire.end.componentId && !found) {
      const key = `${wire.end.componentId}:${wire.end.terminalIndex}`;
      const nodeId = termNode.get(key);
      if (nodeId) {
        const sol = compData.get(wire.end.componentId);
        if (sol) {
          const termIdx = wire.end.terminalIndex;
          current =
            termIdx === 0
              ? -sol.current * sol.currentDirection
              : sol.current * sol.currentDirection;
          found = true;
        }
      }
    }

    if (!found) {
      const startKey = wire.start.componentId
        ? `${wire.start.componentId}:${wire.start.terminalIndex}`
        : null;
      const endKey = wire.end.componentId
        ? `${wire.end.componentId}:${wire.end.terminalIndex}`
        : null;

      let startCurrent = 0;
      let endCurrent = 0;

      if (startKey && termNode.has(startKey)) {
        const sol = compData.get(wire.start.componentId!);
        if (sol) {
          startCurrent =
            wire.start.terminalIndex === 0
              ? sol.current * sol.currentDirection
              : -sol.current * sol.currentDirection;
        }
      }

      if (endKey && termNode.has(endKey)) {
        const sol = compData.get(wire.end.componentId!);
        if (sol) {
          endCurrent =
            wire.end.terminalIndex === 0
              ? -sol.current * sol.currentDirection
              : sol.current * sol.currentDirection;
        }
      }

      if (startCurrent !== 0 || endCurrent !== 0) {
        current = (startCurrent + endCurrent) / 2;
        found = true;
      }
    }

    if (!found && wire.start.componentId && wire.end.componentId) {
      const startSol = compData.get(wire.start.componentId);
      const endSol = compData.get(wire.end.componentId);
      if (startSol && endSol) {
        const startCurrent =
          wire.start.terminalIndex === 0
            ? startSol.current * startSol.currentDirection
            : -startSol.current * startSol.currentDirection;
        const endCurrent =
          wire.end.terminalIndex === 0
            ? -endSol.current * endSol.currentDirection
            : endSol.current * endSol.currentDirection;
        current = (startCurrent + endCurrent) / 2;
      }
    }

    wireCurrents.set(wire.id, current);
  }

  return wireCurrents;
}

function findNodeKey(
  topology: CircuitTopology,
  x: number,
  y: number,
): string | null {
  const k = nodeKey(x, y);
  for (const [nodeId, node] of topology.nodes) {
    if (nodeKey(node.x, node.y) === k) {
      return nodeId;
    }
  }
  return null;
}

/** Gauss-Jordan elimination with partial pivoting. Exported so the
 * time-domain engine reuses the exact same linear algebra as the
 * steady-state solver. */
export function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }

    if (Math.abs(M[maxRow][i]) < 1e-10) return null;

    if (maxRow !== i) {
      [M[i], M[maxRow]] = [M[maxRow], M[i]];
    }

    const pivot = M[i][i];
    for (let j = i; j <= n; j++) {
      M[i][j] /= pivot;
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = M[k][i];
        for (let j = i; j <= n; j++) {
          M[k][j] -= factor * M[i][j];
        }
      }
    }
  }

  return M.map((row) => row[n]);
}

/**
 * Solve a document.
 *
 * Without an AC supply this is the DC operating point, exactly as before.
 * With one, the answer is the superposition of the DC operating point (AC
 * supplies shorted, capacitors open) and the steady state at each source
 * frequency: RMS values combine as √(Vdc² + Σ|Vac|²) and the average power
 * of each part adds, so reactances finally change the reading.
 */
export function solveCircuit(doc: CircuitDoc): SolverResult {
  const topology = buildTopology(doc);

  if (!hasAcSource(doc)) return solveDC(doc, topology);

  const acSourceIds = new Set(
    doc.components.filter((c) => c.type === 'acVoltageSource').map((c) => c.id),
  );
  const dc = solveDC(doc, topology, acSourceIds);
  if (!dc.isValid) return dc;

  const frequencies = acFrequencies(doc);
  const acSolutions: AcSolution[] = [];
  for (const f of frequencies) {
    const solved = solveAcSteadyState(doc, topology, f);
    if (solved) acSolutions.push(solved);
  }
  if (acSolutions.length === 0) {
    return {
      ...dc,
      error: 'AC network has no solution - check the AC source connections',
    };
  }

  const nodeVoltages = new Map<string, number>();
  for (const [id, vdc] of dc.nodeVoltages) {
    let squared = vdc * vdc;
    for (const ac of acSolutions) {
      const v = ac.nodeVoltages.get(id);
      if (v) squared += v.re * v.re + v.im * v.im;
    }
    nodeVoltages.set(id, Math.sqrt(squared) * (vdc < 0 ? -1 : 1));
  }

  const componentData = new Map<string, ComponentSolution>();
  for (const comp of topology.components) {
    const dcSol = dc.componentData.get(comp.id) ?? {
      voltage: 0,
      current: 0,
      power: 0,
      currentDirection: 1,
    };
    if (comp.type === 'ground') {
      componentData.set(comp.id, { ...dcSol, ac: true });
      continue;
    }

    let vSquared = dcSol.voltage * dcSol.voltage;
    let iSquared = dcSol.current * dcSol.current;
    let power = dcSol.power;
    let dominant = 0;
    let phase = 0;

    for (const ac of acSolutions) {
      const v = ac.voltage.get(comp.id);
      const i = ac.current.get(comp.id);
      if (v) {
        vSquared += v.re * v.re + v.im * v.im;
        const mag = phasorMag(v);
        if (mag > dominant) {
          dominant = mag;
          phase = phasorAngle(v);
        }
      }
      if (i) iSquared += i.re * i.re + i.im * i.im;
      power += ac.power.get(comp.id) ?? 0;
    }

    // Keep the DC polarity when there is one; a purely alternating quantity
    // has no sign, so it reports as the magnitude an instrument would show.
    const vSign = Math.abs(dcSol.voltage) > 1e-9 ? Math.sign(dcSol.voltage) : 1;
    const iSign = Math.abs(dcSol.current) > 1e-9 ? Math.sign(dcSol.current) : 1;

    componentData.set(comp.id, {
      voltage: Math.sqrt(vSquared) * vSign,
      current: Math.sqrt(iSquared) * iSign,
      power,
      currentDirection: iSign,
      ac: true,
      frequency: acSolutions.length === 1 ? acSolutions[0].frequency : undefined,
      phase,
    });
  }

  return {
    nodeVoltages,
    branchCurrents: dc.branchCurrents,
    componentData,
    wireCurrents: computeWireCurrents(doc, topology, componentData),
    isValid: true,
    frequencies,
  };
}

export { nodeKey };
