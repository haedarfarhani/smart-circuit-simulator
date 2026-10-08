import { describe, expect, it } from 'vitest';
import {
  hitTestWires,
  junctionNodes,
  snapOnSegment,
} from './junctions';
import { buildTopology } from './solver';
import type { CircuitDoc, Point, Wire } from '../models/circuit';

const wire = (
  id: string,
  start: Point | { componentId: string; terminalIndex: number },
  end: Point | { componentId: string; terminalIndex: number },
  waypoints: Point[] = [],
): Wire => {
  const end2 = (e: Point | { componentId: string; terminalIndex: number }) =>
    'componentId' in e
      ? { componentId: e.componentId, terminalIndex: e.terminalIndex, point: null }
      : { componentId: null, terminalIndex: 0, point: e };
  return { id, start: end2(start), end: end2(end), waypoints };
};

describe('snapOnSegment', () => {
  it('snaps along a horizontal segment without leaving it', () => {
    const p = snapOnSegment(
      { x: 47, y: 3 }, // 3 is not on the segment: the perpendicular coord wins
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    );
    expect(p).toEqual({ x: 50, y: 0 });
  });

  it('clamps into the segment instead of overflowing past its ends', () => {
    const p = snapOnSegment({ x: 96, y: 0 }, { x: 0, y: 0 }, { x: 90, y: 0 });
    expect(p).toEqual({ x: 90, y: 0 });
  });

  it('snaps along a vertical segment', () => {
    const p = snapOnSegment({ x: 5, y: 44 }, { x: 0, y: 0 }, { x: 0, y: 80 });
    expect(p).toEqual({ x: 0, y: 40 });
  });
});

describe('hitTestWires', () => {
  const doc: CircuitDoc = {
    components: [],
    wires: [wire('w1', { x: 0, y: 0 }, { x: 100, y: 0 })],
  };

  it('returns null when the cursor is far from every wire', () => {
    expect(hitTestWires(doc, { x: 50, y: 90 }, 10)).toBeNull();
  });

  it('finds the point on the wire body and asks for an insertion there', () => {
    const hit = hitTestWires(doc, { x: 47, y: 4 }, 10);
    expect(hit).not.toBeNull();
    expect(hit!.wireId).toBe('w1');
    expect(hit!.point).toEqual({ x: 50, y: 0 });
    // no waypoints yet → the point must be inserted at index 0
    expect(hit!.insertIndex).toBe(0);
  });

  it('does not ask for an insertion at an existing waypoint', () => {
    const withBend: CircuitDoc = {
      components: [],
      wires: [
        wire('w1', { x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: 50, y: 0 }]),
      ],
    };
    const hit = hitTestWires(withBend, { x: 52, y: 2 }, 10);
    expect(hit!.point).toEqual({ x: 50, y: 0 });
    expect(hit!.insertIndex).toBeNull();
  });

  it('does not ask for an insertion at a wire end', () => {
    const hit = hitTestWires(doc, { x: 2, y: 3 }, 10);
    expect(hit!.point).toEqual({ x: 0, y: 0 });
    expect(hit!.insertIndex).toBeNull();
  });

  it('maps the segment hit to the right waypoint slot', () => {
    // path: (0,0) → wp1 (40,0) → wp2 (40,60) → (100,60)
    const bent: CircuitDoc = {
      components: [],
      wires: [
        wire(
          'w1',
          { x: 0, y: 0 },
          { x: 100, y: 60 },
          [
            { x: 40, y: 0 },
            { x: 40, y: 60 },
          ],
        ),
      ],
    };
    // vertical leg between the two waypoints
    const onVertical = hitTestWires(bent, { x: 42, y: 40 }, 10);
    expect(onVertical!.point).toEqual({ x: 40, y: 40 });
    expect(onVertical!.insertIndex).toBe(1);
  });
});

describe('junctionNodes', () => {
  it('marks a T-junction where a wire attaches to another wire body', () => {
    const doc: CircuitDoc = {
      components: [],
      wires: [
        // trunk, with the attachment point stored as a vertex
        wire('trunk', { x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: 50, y: 0 }]),
        // branch dropping off the trunk
        wire('branch', { x: 50, y: 0 }, { x: 50, y: 40 }),
      ],
    };
    expect(junctionNodes(doc)).toEqual([{ x: 50, y: 0 }]);
  });

  it('does not mark a plain bend or a two-wire corner', () => {
    const doc: CircuitDoc = {
      components: [],
      wires: [
        wire('a', { x: 0, y: 0 }, { x: 40, y: 0 }, [{ x: 20, y: 0 }]),
        wire('b', { x: 0, y: 0 }, { x: 0, y: 40 }),
      ],
    };
    expect(junctionNodes(doc)).toEqual([]);
  });
});

describe('solver connectivity through a junction', () => {
  // A trunk plus a branch that attaches halfway along it, at a point that is
  // not otherwise a vertex of the trunk.
  const cross = (trunkWaypoints: Point[]): CircuitDoc => ({
    components: [],
    wires: [
      wire('trunk', { x: 0, y: 0 }, { x: 100, y: 0 }, trunkWaypoints),
      wire('branch', { x: 50, y: 0 }, { x: 50, y: 50 }),
    ],
  });

  it('leaves the branch on its own node while the point is not a vertex', () => {
    expect(buildTopology(cross([])).nodes.size).toBe(2);
  });

  it('merges both wires into one node once the junction point is a vertex', () => {
    expect(buildTopology(cross([{ x: 50, y: 0 }])).nodes.size).toBe(1);
  });
});
