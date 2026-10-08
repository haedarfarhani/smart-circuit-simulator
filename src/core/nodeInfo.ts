import type { CircuitDoc } from '../models/circuit';
import { nodeKey, type CircuitTopology } from './solver';
import { resolveEnd } from './wirePath';
import type { SolverResult } from './solver';
import type { SimSnapshot } from '../store/simulationStore';

/** One conductor touching a node. */
export interface NodeBranch {
  id: string;
  kind: 'component' | 'wire';
  /** display text, e.g. "V1" or "R1–C1" */
  label: string;
  /** component type, or 'wire' */
  type: string;
  /** magnitude in amperes */
  current: number;
  /** true when the current flows out of the node, false when it flows in */
  leaving: boolean;
  /** a wire that merely passes through the node inside one segment */
  through?: boolean;
}

export interface NodeReport {
  id: string;
  voltage: number;
  branches: NodeBranch[];
}

export interface NodeHit {
  nodeId: string;
  point: { x: number; y: number };
  distance: number;
}

/**
 * Nearest node connection point to `world`. Node markers are hit geometrically
 * rather than with extra SVG elements, so hovering never steals clicks from
 * terminals, wires or components.
 */
export function findNodeAt(
  topology: CircuitTopology,
  world: { x: number; y: number },
  tolerance: number,
): NodeHit | null {
  let best: NodeHit | null = null;
  for (const [key, nodeId] of topology.nodeByKey) {
    const [x, y] = key.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const distance = Math.hypot(x - world.x, y - world.y);
    if (distance > tolerance) continue;
    if (!best || distance < best.distance) {
      best = { nodeId, point: { x, y }, distance };
    }
  }
  return best;
}

function wireLabel(doc: CircuitDoc, componentId: string | null): string {
  if (!componentId) return '•';
  return doc.components.find((c) => c.id === componentId)?.label ?? '•';
}

/**
 * Everything a node shows on hover: its voltage and the currents of the
 * conductors attached to it.
 *
 * Sign convention follows the solver: a component's current is positive from
 * its terminal 0 (`nodeA`) to terminal 1 (`nodeB`), and a wire's current is
 * positive from its start toward its end — the same direction the flow
 * animation moves in.
 */
export function nodeReport(
  doc: CircuitDoc,
  topology: CircuitTopology,
  result: (SolverResult | SimSnapshot) | null,
  nodeId: string,
): NodeReport | null {
  const node = topology.nodes.get(nodeId);
  if (!node) return null;

  const voltage = result?.nodeVoltages.get(nodeId) ?? 0;
  const branches: NodeBranch[] = [];

  for (const comp of topology.components) {
    const onA = comp.nodeA === nodeId;
    const onB = comp.nodeB === nodeId;
    if (!onA && !onB) continue;
    const current = result?.componentData.get(comp.id)?.current ?? 0;
    const definition = doc.components.find((c) => c.id === comp.id);
    branches.push({
      id: comp.id,
      kind: 'component',
      label: definition?.label ?? comp.id,
      type: comp.type,
      current: Math.abs(current),
      leaving: onA ? current >= 0 : current < 0,
    });
  }

  for (const wire of doc.wires) {
    const s = resolveEnd(doc, wire.start);
    const e = resolveEnd(doc, wire.end);
    if (!s || !e) continue;

    const startNode = topology.nodeByKey.get(nodeKey(s.x, s.y));
    const endNode = topology.nodeByKey.get(nodeKey(e.x, e.y));
    const interior = wire.waypoints.some(
      (p) => topology.nodeByKey.get(nodeKey(p.x, p.y)) === nodeId,
    );

    const atStart = startNode === nodeId;
    const atEnd = endNode === nodeId;
    if (!atStart && !atEnd && !interior) continue;

    const current = result?.wireCurrents.get(wire.id) ?? 0;
    // a wire that reaches the node only through an inner vertex keeps flowing
    // past it instead of ending there
    const through = interior && !atStart && !atEnd;

    branches.push({
      id: wire.id,
      kind: 'wire',
      label: `${wireLabel(doc, wire.start.componentId)}–${wireLabel(
        doc,
        wire.end.componentId,
      )}`,
      type: 'wire',
      current: Math.abs(current),
      leaving: atStart,
      through,
    });
  }

  return { id: nodeId, voltage, branches };
}
