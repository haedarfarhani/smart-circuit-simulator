import type {
  CircuitComponent,
  Point,
  Rotation,
  TerminalDef,
} from '../models/circuit';
import { SYMBOLS } from './symbols';

/** Rotate a point around the origin by a multiple of 90 degrees. */
export function rotatePoint(p: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
    default:
      return { x: p.x, y: p.y };
  }
}

/** World position + outward direction of a component terminal. */
export function terminalWorld(
  comp: CircuitComponent,
  index: number,
): Point & { dx: number; dy: number } {
  const dyn = SYMBOLS[comp.type].terminalsFor?.(comp);
  const def: TerminalDef | undefined = dyn
    ? dyn[index]
    : SYMBOLS[comp.type].terminals[index];
  // A stale terminal index (e.g. a wire attached to a pin that a width
  // change removed) falls back to the component center instead of crashing.
  if (!def) return { x: comp.x, y: comp.y, dx: 1, dy: 0 };
  // Horizontal mirror is applied in local space (before rotation), exactly
  // like the `scale(-1,1)` render transform — keeps wires locked to symbols.
  const mx = comp.mirrored ? -1 : 1;
  const local = rotatePoint({ x: def.x * mx, y: def.y }, comp.rotation);
  const dir = rotatePoint({ x: def.dx * mx, y: def.dy }, comp.rotation);
  return { x: comp.x + local.x, y: comp.y + local.y, dx: dir.x, dy: dir.y };
}

/** Number of terminals a component instance exposes (width-dependent for
 * digital multi-bit devices). */
export function terminalCount(comp: CircuitComponent): number {
  const dyn = SYMBOLS[comp.type].terminalsFor?.(comp);
  return dyn ? dyn.length : SYMBOLS[comp.type].terminals.length;
}

export function allTerminals(
  comp: CircuitComponent,
): (Point & { dx: number; dy: number })[] {
  const dyn = SYMBOLS[comp.type].terminalsFor?.(comp);
  const n = dyn ? dyn.length : SYMBOLS[comp.type].terminals.length;
  return Array.from({ length: n }, (_, i) => terminalWorld(comp, i));
}

/** Axis-aligned bounds of a component in world units (label included). */
export function componentBounds(comp: CircuitComponent): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const def = SYMBOLS[comp.type];
  const half = Math.max(def.w, def.h) / 2;
  // Rotating a w×h box by 90° swaps the axes; using the max keeps it safe.
  return { x: comp.x - half, y: comp.y - half, w: half * 2, h: half * 2 };
}

export function pointInBounds(
  p: Point,
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

/** Distance from point p to segment ab (2D). */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
