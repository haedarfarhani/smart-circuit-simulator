import { snap, snapPoint, type CircuitDoc, type Point } from '../models/circuit';
import { nodeKey } from './solver';
import { resolveEnd, wirePathDetail } from './wirePath';

/**
 * Attaching a wire to the middle of another wire.
 *
 * Connectivity in this model is geometric: `buildTopology` unions every shared
 * grid point of terminals, wire endpoints and wire waypoints. So attaching to
 * the middle of a wire only becomes a real electrical node once the attachment
 * point is also a vertex of the target wire — `insertIndex` says where.
 */
export interface WireAttachment {
  wireId: string;
  /** grid-aligned point lying exactly on the target wire */
  point: Point;
  /** insertion index in the target wire's waypoints, or null when the point is already a vertex / endpoint there */
  insertIndex: number | null;
  distance: number;
}

interface Projected extends Point {
  t: number;
}

function projectOnSegment(p: Point, a: Point, b: Point): Projected {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: a.x, y: a.y, t: 0 };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + t * dx, y: a.y + t * dy, t };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Snap a point onto a segment without leaving it: the perpendicular coordinate
 * comes from the segment (already grid aligned) and the along-axis coordinate
 * is grid-snapped then clamped into the segment.
 */
export function snapOnSegment(p: Point, a: Point, b: Point): Point {
  if (a.y === b.y) {
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    return { x: Math.min(Math.max(snap(p.x), lo), hi), y: a.y };
  }
  if (a.x === b.x) {
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    return { x: a.x, y: Math.min(Math.max(snap(p.y), lo), hi) };
  }
  return snapPoint(p);
}

/** How many stored waypoints lie at or before path segment `index`. */
function anchorsBefore(anchors: number[], index: number): number {
  let n = 0;
  for (const a of anchors) if (a <= index) n++;
  return n;
}

/**
 * Nearest wire to `world` within `tolerance` world units, together with the
 * junction point to attach at. Returns the closest wire so overlapping hit
 * areas resolve predictably.
 */
export function hitTestWires(
  doc: CircuitDoc,
  world: Point,
  tolerance: number,
): WireAttachment | null {
  let best: WireAttachment | null = null;

  for (const wire of doc.wires) {
    const detail = wirePathDetail(doc, wire);
    if (!detail) continue;

    const pts = detail.points;
    const s = resolveEnd(doc, wire.start);
    const e = resolveEnd(doc, wire.end);

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const d = dist(projectOnSegment(world, a, b), world);
      if (d > tolerance) continue;
      if (best && d >= best.distance) continue;

      const point = snapOnSegment(world, a, b);

      // Already a vertex of this wire? Then it is a node there and nothing has
      // to change. Same for a point that coincides with either end.
      const isVertex = wire.waypoints.some(
        (w) => w.x === point.x && w.y === point.y,
      );
      const isEnd =
        (s !== null && s.x === point.x && s.y === point.y) ||
        (e !== null && e.x === point.x && e.y === point.y);

      best = {
        wireId: wire.id,
        point,
        insertIndex: isVertex || isEnd ? null : anchorsBefore(detail.anchors, i),
        distance: d,
      };
    }
  }

  return best;
}

/**
 * Points that deserve a junction dot: places where three or more conductor
 * ends meet. A wire passing through a point contributes two (one per
 * direction), so a T-junction counts three while a plain corner or a terminal
 * with two wires counts two and stays dot-free.
 */
export function junctionNodes(doc: CircuitDoc): Point[] {
  const counts = new Map<string, { point: Point; count: number }>();

  const add = (p: Point, n: number) => {
    const k = nodeKey(p.x, p.y);
    const found = counts.get(k);
    if (found) found.count += n;
    else counts.set(k, { point: { x: p.x, y: p.y }, count: n });
  };

  for (const wire of doc.wires) {
    const s = resolveEnd(doc, wire.start);
    const e = resolveEnd(doc, wire.end);
    if (s) add(s, 1);
    if (e) add(e, 1);
    // A stored vertex is passed through in both directions.
    for (const wp of wire.waypoints) add(wp, 2);
  }

  return [...counts.values()]
    .filter((c) => c.count >= 3)
    .map((c) => c.point);
}
