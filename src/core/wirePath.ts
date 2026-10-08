import {
  snap,
  snapPoint,
  type CircuitDoc,
  type Point,
  type Wire,
  type WireEndpoint,
} from '../models/circuit';
import { terminalWorld } from './geometry';
import {
  autoRoute,
  connectPoints,
  extendFrom,
  routeToTerminal,
  simplify,
  STUB,
} from './routing';

export interface ResolvedEnd extends Point {
  dx: number;
  dy: number;
  attached: boolean;
}

/** Resolve a wire endpoint to a world point (terminal or free position). */
export function resolveEnd(
  doc: CircuitDoc,
  end: WireEndpoint,
): ResolvedEnd | null {
  if (end.componentId) {
    const comp = doc.components.find((c) => c.id === end.componentId);
    if (!comp) return null;
    const t = terminalWorld(comp, end.terminalIndex);
    return { x: t.x, y: t.y, dx: t.dx, dy: t.dy, attached: true };
  }
  if (end.point) {
    return { x: end.point.x, y: end.point.y, dx: 0, dy: 0, attached: false };
  }
  return null;
}

function leaveAlong(from: Point, dir: { dx: number; dy: number }, to: Point): Point[] {
  const stub = { x: from.x + dir.dx * STUB, y: from.y + dir.dy * STUB };
  return [from, stub, ...extendFrom(stub, dir.dx !== 0, to).slice(1)];
}

/**
 * Midpoint of a wire's longest straight run, grid aligned and exactly on the
 * polyline. Used as the handle that lets a wire be dragged out of the way of
 * whatever it currently runs over.
 */
export function wireHandle(doc: CircuitDoc, wire: Wire): Point | null {
  const detail = wirePathDetail(doc, wire);
  if (!detail || detail.points.length < 2) return null;

  const pts = detail.points;
  let bestIndex = 0;
  let bestLength = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const length = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (length > bestLength) {
      bestLength = length;
      bestIndex = i;
    }
  }

  const a = pts[bestIndex];
  const b = pts[bestIndex + 1];
  if (a.y === b.y) {
    const mid = snap((a.x + b.x) / 2);
    return {
      x: Math.min(Math.max(mid, Math.min(a.x, b.x)), Math.max(a.x, b.x)),
      y: a.y,
    };
  }
  if (a.x === b.x) {
    const mid = snap((a.y + b.y) / 2);
    return {
      x: a.x,
      y: Math.min(Math.max(mid, Math.min(a.y, b.y)), Math.max(a.y, b.y)),
    };
  }
  return snapPoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
}

/**
 * Move a wire by (dx, dy) without detaching it: attached ends stay on their
 * terminals and only the wire's own control points shift.
 *
 * A wire with no bend points yet gets one at its longest run, placed exactly on
 * the current polyline, so the first drag already bends the wire aside instead
 * of doing nothing.
 */
export function offsetWire(
  doc: CircuitDoc,
  wire: Wire,
  dx: number,
  dy: number,
): Wire {
  const shiftPoint = (p: Point): Point =>
    snapPoint({ x: p.x + dx, y: p.y + dy });
  const shiftEndpoint = (e: WireEndpoint): WireEndpoint => {
    if (e.componentId) return e;
    if (!e.point) return e;
    return { ...e, point: shiftPoint(e.point) };
  };

  let waypoints = wire.waypoints.map(shiftPoint);
  if (wire.waypoints.length === 0) {
    const handle = wireHandle(doc, wire);
    if (handle) waypoints = [shiftPoint(handle)];
  }

  return {
    ...wire,
    start: shiftEndpoint(wire.start),
    end: shiftEndpoint(wire.end),
    waypoints,
  };
}

export interface WirePathDetail {
  /** raw polyline (not simplified) */
  points: Point[];
  /** index into `points` of each stored waypoint, in `wire.waypoints` order */
  anchors: number[];
}

/**
 * Full polyline for a wire plus the position of every stored waypoint inside
 * it. The anchors let a hit on the rendered path be mapped back to an insertion
 * index in `wire.waypoints` (used when attaching a junction to a wire).
 */
export function wirePathDetail(
  doc: CircuitDoc,
  wire: Wire,
): WirePathDetail | null {
  const s = resolveEnd(doc, wire.start);
  const e = resolveEnd(doc, wire.end);
  if (!s || !e) return null;

  const wp = wire.waypoints;

  if (wp.length === 0) {
    const path =
      s.attached && e.attached
        ? autoRoute(s, e)
        : s.attached
          ? leaveAlong(s, s, e)
          : e.attached
            ? routeToTerminal(s, e)
            : connectPoints(s, e, true);
    return { points: path, anchors: [] };
  }

  const pts: Point[] = [{ x: s.x, y: s.y }];
  const append = (leg: Point[]) => {
    for (const p of leg.slice(1)) pts.push({ x: p.x, y: p.y });
  };

  // start → first waypoint
  append(s.attached ? leaveAlong(s, s, wp[0]) : connectPoints(s, wp[0], true));
  const anchors: number[] = [pts.length - 1];

  // waypoint → waypoint (alternate elbow direction for natural-looking routes)
  for (let i = 0; i < wp.length - 1; i++) {
    const preferH = i % 2 === 0;
    append(connectPoints(wp[i], wp[i + 1], preferH));
    anchors.push(pts.length - 1);
  }

  // last anchor → end
  const last = wp[wp.length - 1];
  append(
    e.attached
      ? routeToTerminal(last, e)
      : connectPoints(last, e, wp.length % 2 === 0),
  );

  return { points: pts, anchors };
}

/**
 * Full polyline for a wire, recomputed from live terminal positions so wires
 * follow components when they move.
 */
export function buildWirePath(doc: CircuitDoc, wire: Wire): Point[] | null {
  const detail = wirePathDetail(doc, wire);
  if (!detail) return null;
  return wire.waypoints.length === 0 ? detail.points : simplify(detail.points);
}

/** SVG path `d` attribute for a polyline with optional rounded corners. */
export function toSvgPath(pts: Point[], rounded = false): string {
  if (pts.length === 0) return '';
  if (!rounded || pts.length < 3) {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  }

  const radius = 4;
  let d = `M${pts[0].x} ${pts[0].y}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const isCorner = (dx1 !== 0 && dy2 !== 0) || (dy1 !== 0 && dx2 !== 0);

    if (isCorner) {
      const len1 = Math.hypot(dx1, dy1);
      const len2 = Math.hypot(dx2, dy2);
      const r = Math.min(radius, len1 / 2, len2 / 2);

      const nx1 = dx1 / len1;
      const ny1 = dy1 / len1;
      const nx2 = dx2 / len2;
      const ny2 = dy2 / len2;

      const startX = curr.x - nx1 * r;
      const startY = curr.y - ny1 * r;
      const endX = curr.x + nx2 * r;
      const endY = curr.y + ny2 * r;

      d += ` L${startX} ${startY}`;
      d += ` Q${curr.x} ${curr.y} ${endX} ${endY}`;
    } else {
      d += ` L${curr.x} ${curr.y}`;
    }
  }

  d += ` L${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
  return d;
}
