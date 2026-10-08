import { describe, expect, it } from 'vitest';
import { buildWirePath, offsetWire, wireHandle } from './wirePath';
import { simplify } from './routing';
import type { CircuitDoc, Wire } from '../models/circuit';

const doc: CircuitDoc = {
  components: [
    {
      id: 'v1',
      type: 'battery',
      x: 300,
      y: 200,
      rotation: 0,
      label: 'V1',
      value: 9,
    },
    {
      id: 'r1',
      type: 'resistor',
      x: 700,
      y: 200,
      rotation: 0,
      label: 'R1',
      value: 100,
    },
  ],
  wires: [],
};

const wire = (
  id: string,
  start: Wire['start'],
  end: Wire['end'],
  waypoints: Wire['waypoints'] = [],
): Wire => ({ id, start, end, waypoints });

const term = (id: string, index: number) => ({
  componentId: id,
  terminalIndex: index,
  point: null,
});

describe('wireHandle', () => {
  it('sits at the middle of a straight run, on the wire and on the grid', () => {
    const w = wire('w', term('v1', 1), term('r1', 0));
    const handle = wireHandle(doc, w)!;
    expect(handle.y).toBe(200);
    expect(handle.x % 10).toBe(0);
    // between the two terminals of the run
    expect(handle.x).toBeGreaterThan(340);
    expect(handle.x).toBeLessThan(660);
  });

  it('picks the longest run of a bent wire', () => {
    // 100 units across, then 200 units up: the vertical leg is the handle
    const w = wire(
      'w',
      { componentId: null, terminalIndex: 0, point: { x: 0, y: 0 } },
      { componentId: null, terminalIndex: 0, point: { x: 100, y: 200 } },
      [{ x: 100, y: 0 }],
    );
    const handle = wireHandle(doc, w)!;
    expect(handle).toEqual({ x: 100, y: 100 });
  });

  it('returns null when the wire cannot be resolved', () => {
    const w = wire('w', term('missing', 0), term('r1', 0));
    expect(wireHandle(doc, w)).toBeNull();
  });
});

describe('offsetWire', () => {
  it('never leaves a moved wire looking different before it is moved', () => {
    const w = wire('w', term('v1', 1), term('r1', 0));
    const before = simplify(buildWirePath(doc, w)!);
    const moved = offsetWire(doc, w, 0, 0);
    expect(buildWirePath(doc, moved)).toEqual(before);
  });

  it('gives a handle to a wire that had no bend points', () => {
    const w = wire('w', term('v1', 1), term('r1', 0));
    expect(w.waypoints).toEqual([]);
    const moved = offsetWire(doc, w, 0, 40);
    expect(moved.waypoints.length).toBe(1);
    // the run moved off its original line
    expect(moved.waypoints[0].y).toBe(240);
  });

  it('keeps attached ends on their terminals and shifts bend points', () => {
    const w = wire('w', term('v1', 1), term('r1', 0), [{ x: 500, y: 200 }]);
    const moved = offsetWire(doc, w, 0, -30);
    expect(moved.start).toBe(w.start);
    expect(moved.end).toBe(w.end);
    expect(moved.waypoints).toEqual([{ x: 500, y: 170 }]);
  });

  it('moves a free end along with the wire', () => {
    const w = wire(
      'w',
      term('v1', 1),
      { componentId: null, terminalIndex: 0, point: { x: 700, y: 400 } },
      [{ x: 700, y: 200 }],
    );
    const moved = offsetWire(doc, w, 10, 20);
    expect(moved.end.point).toEqual({ x: 710, y: 420 });
    expect(moved.waypoints).toEqual([{ x: 710, y: 220 }]);
    expect(moved.start.componentId).toBe('v1');
  });

  it('snaps the offset to the grid', () => {
    const w = wire('w', term('v1', 1), term('r1', 0), [{ x: 500, y: 200 }]);
    const moved = offsetWire(doc, w, 13, -7);
    expect(moved.waypoints).toEqual([{ x: 510, y: 190 }]);
  });
});
