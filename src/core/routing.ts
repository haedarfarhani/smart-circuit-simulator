import type { Point } from '../models/circuit';

/**
 * Orthogonal wire routing.
 * All functions return polylines that include both endpoints and contain
 * no duplicate or collinear consecutive points (after `simplify`).
 */

export const STUB = 10;

export interface DirPoint extends Point {
  dx: number;
  dy: number;
}

/** Remove duplicate and collinear consecutive points. */
export function simplify(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push({ x: p.x, y: p.y });
  }
  const deduped: Point[] = [];
  for (let i = 0; i < out.length; i++) {
    const prev = deduped[deduped.length - 1];
    const cur = out[i];
    const next = out[i + 1];
    if (
      prev &&
      next &&
      ((prev.x === cur.x && cur.x === next.x) ||
        (prev.y === cur.y && cur.y === next.y))
    ) {
      continue;
    }
    deduped.push(cur);
  }
  return deduped;
}

/**
 * Route between two terminals, leaving each terminal along its outward
 * direction (stub), joined by an L or Z shape.
 */
export function autoRoute(a: DirPoint, b: DirPoint): Point[] {
  const sa: Point = { x: a.x + a.dx * STUB, y: a.y + a.dy * STUB };
  const sb: Point = { x: b.x + b.dx * STUB, y: b.y + b.dy * STUB };

  const aHoriz = a.dy === 0;
  const bHoriz = b.dy === 0;

  if (aHoriz && bHoriz) {
    // Z-shape; simplify collapses it to a straight line when collinear.
    const midX = (sa.x + sb.x) / 2;
    return simplify([
      { ...a },
      sa,
      { x: midX, y: sa.y },
      { x: midX, y: sb.y },
      sb,
      { ...b },
    ]);
  }

  if (!aHoriz && !bHoriz) {
    const midY = (sa.y + sb.y) / 2;
    return simplify([
      { ...a },
      sa,
      { x: sa.x, y: midY },
      { x: sb.x, y: midY },
      sb,
      { ...b },
    ]);
  }

  // mixed: one horizontal terminal, one vertical
  const elbow: Point = aHoriz ? { x: sb.x, y: sa.y } : { x: sa.x, y: sb.y };
  return simplify([{ ...a }, sa, elbow, sb, { ...b }]);
}

/** Route from a free point to a terminal, approaching along the terminal axis. */
export function routeToTerminal(from: Point, b: DirPoint): Point[] {
  const sb: Point = { x: b.x + b.dx * STUB, y: b.y + b.dy * STUB };
  if (b.dy === 0) {
    if (from.y === b.y) return simplify([{ ...from }, { ...b }]);
    return simplify([{ ...from }, { x: sb.x, y: from.y }, sb, { ...b }]);
  }
  if (from.x === b.x) return simplify([{ ...from }, { ...b }]);
  return simplify([{ ...from }, { x: from.x, y: sb.y }, sb, { ...b }]);
}

/** L-shaped connection between two free points. */
export function connectPoints(
  a: Point,
  b: Point,
  preferHorizontal = true,
): Point[] {
  if (a.x === b.x || a.y === b.y) return simplify([{ ...a }, { ...b }]);
  const elbow = preferHorizontal
    ? { x: b.x, y: a.y }
    : { x: a.x, y: b.y };
  return simplify([{ ...a }, elbow, { ...b }]);
}

/** Continue a draft from a point in a known direction toward a target point. */
export function extendFrom(
  from: Point,
  horizontal: boolean,
  to: Point,
): Point[] {
  if (from.x === to.x || from.y === to.y) return simplify([{ ...from }, { ...to }]);
  const elbow = horizontal
    ? { x: to.x, y: from.y }
    : { x: from.x, y: to.y };
  return simplify([{ ...from }, elbow, { ...to }]);
}
