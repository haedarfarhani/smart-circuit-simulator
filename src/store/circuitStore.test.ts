import { beforeEach, describe, expect, it } from 'vitest';
import { useCircuitStore } from './circuitStore';
import { useUiStore } from './uiStore';

function store() {
  return useCircuitStore.getState();
}

beforeEach(() => {
  useCircuitStore.setState({
    doc: { components: [], wires: [] },
    past: [],
    future: [],
    lastChange: 0,
    savedAt: null,
  });
  useUiStore.setState({ selection: [], wireDraft: null });
});

describe('addComponent', () => {
  it('snaps position to the grid and assigns a designator', () => {
    const id = store().addComponent('resistor', 13, -27);
    expect(id).toBeTruthy();
    const c = store().doc.components[0];
    expect(c.x).toBe(10);
    expect(c.y).toBe(-30);
    expect(c.label).toBe('R1');
    expect(c.value).toBe(100);
  });

  it('increments designators', () => {
    store().addComponent('resistor', 0, 0);
    store().addComponent('resistor', 50, 0);
    store().addComponent('battery', 100, 0);
    expect(store().doc.components.map((c) => c.label)).toEqual([
      'R1',
      'R2',
      'V1',
    ]);
  });
});

describe('undo / redo', () => {
  it('restores the previous document', () => {
    store().addComponent('resistor', 0, 0);
    store().addComponent('resistor', 50, 0);
    expect(store().doc.components.length).toBe(2);

    store().undo();
    expect(store().doc.components.length).toBe(1);

    store().undo();
    expect(store().doc.components.length).toBe(0);
    expect(store().canUndo()).toBe(false);

    store().redo();
    expect(store().doc.components.length).toBe(1);
    store().redo();
    expect(store().doc.components.length).toBe(2);
    expect(store().canRedo()).toBe(false);
  });

  it('clears the redo stack after a new change', () => {
    store().addComponent('resistor', 0, 0);
    store().undo();
    expect(store().canRedo()).toBe(true);
    store().addComponent('battery', 0, 0);
    expect(store().canRedo()).toBe(false);
  });
});

describe('move and rotate', () => {
  it('moves only the requested components and keeps the grid snap', () => {
    const a = store().addComponent('resistor', 0, 0)!;
    const b = store().addComponent('resistor', 100, 0)!;
    store().moveComponents([a], 13, -7);
    const ca = store().doc.components.find((c) => c.id === a)!;
    const cb = store().doc.components.find((c) => c.id === b)!;
    expect(ca.x).toBe(10);
    expect(ca.y).toBe(-10);
    expect(cb.x).toBe(100);
    expect(cb.y).toBe(0);
  });

  it('rotates through 0 → 90 → 180 → 270 → 0', () => {
    const id = store().addComponent('resistor', 0, 0)!;
    const rotations = [90, 180, 270, 0];
    for (const r of rotations) {
      store().rotateComponents([id]);
      const c = store().doc.components[0];
      expect(c.rotation).toBe(r);
    }
  });
});

describe('deleteElements', () => {
  it('removes components and any wires attached to them', () => {
    const r = store().addComponent('resistor', 0, 0)!;
    const v = store().addComponent('battery', 200, 0)!;
    store().addWire(
      { componentId: r, terminalIndex: 1, point: null },
      { componentId: v, terminalIndex: 0, point: null },
      [],
    );
    expect(store().doc.wires.length).toBe(1);

    store().deleteElements([r]);
    expect(store().doc.components.length).toBe(1);
    expect(store().doc.wires.length).toBe(0);
  });

  it('keeps wires not attached to the deleted component', () => {
    const r = store().addComponent('resistor', 0, 0)!;
    const v = store().addComponent('battery', 200, 0)!;
    store().addWire(
      { componentId: r, terminalIndex: 1, point: null },
      { componentId: v, terminalIndex: 0, point: null },
      [],
    );
    store().deleteElements([v]);
    expect(store().doc.wires.length).toBe(0);
  });
});

describe('duplicateComponents', () => {
  it('copies components with fresh ids and labels, offset by a grid step', () => {
    const r = store().addComponent('resistor', 40, 40)!;
    const ids = store().duplicateComponents([r]);
    expect(ids.length).toBe(1);
    expect(store().doc.components.length).toBe(2);
    const copy = store().doc.components[1];
    expect(copy.id).not.toBe(r);
    expect(copy.label).toBe('R2');
    expect(copy.x).toBe(80);
    expect(copy.y).toBe(80);
  });

  it('copies wires whose both ends are inside the copied set', () => {
    const r = store().addComponent('resistor', 0, 0)!;
    const v = store().addComponent('battery', 200, 0)!;
    const w = store().addWire(
      { componentId: r, terminalIndex: 1, point: null },
      { componentId: v, terminalIndex: 0, point: null },
      [],
    );
    const ids = store().duplicateComponents([r, v]);
    expect(ids.length).toBe(2);
    expect(store().doc.wires.length).toBe(2);
    const fresh = store().doc.wires.find((x) => x.id !== w)!;
    expect(ids).toContain(fresh.start.componentId);
    expect(ids).toContain(fresh.end.componentId);
  });
});

describe('wires', () => {
  it('snaps free endpoints to the grid', () => {
    const id = store().addWire(
      { componentId: null, terminalIndex: 0, point: { x: 13, y: 27 } },
      { componentId: null, terminalIndex: 0, point: { x: 100, y: 100 } },
      [],
    );
    const wire = store().doc.wires.find((w) => w.id === id)!;
    expect(wire.start.point).toEqual({ x: 10, y: 30 });
  });
});

describe('addWire junctions', () => {
  const free = (x: number, y: number) => ({
    componentId: null,
    terminalIndex: 0,
    point: { x, y },
  });

  it('inserts the junction point into the target wire', () => {
    const trunk = store().addWire(free(0, 0), free(100, 0), []);
    store().addWire(free(50, 0), free(50, 50), [], [
      { wireId: trunk, point: { x: 50, y: 0 }, insertIndex: 0 },
    ]);

    const trunkWire = store().doc.wires.find((w) => w.id === trunk)!;
    expect(trunkWire.waypoints).toEqual([{ x: 50, y: 0 }]);
    expect(store().doc.wires.length).toBe(2);
  });

  it('creates the wire and its junction in one undo step', () => {
    const trunk = store().addWire(free(0, 0), free(100, 0), []);
    store().addWire(free(50, 0), free(50, 50), [], [
      { wireId: trunk, point: { x: 50, y: 0 }, insertIndex: 0 },
    ]);

    store().undo();
    expect(store().doc.wires.length).toBe(1);
    expect(store().doc.wires[0].waypoints).toEqual([]);
  });

  it('does not duplicate a junction point that is already a vertex', () => {
    const trunk = store().addWire(free(0, 0), free(100, 0), [
      { x: 50, y: 0 },
    ]);
    store().addWire(free(50, 0), free(50, 50), [], [
      { wireId: trunk, point: { x: 50, y: 0 }, insertIndex: 0 },
    ]);
    const trunkWire = store().doc.wires.find((w) => w.id === trunk)!;
    expect(trunkWire.waypoints).toEqual([{ x: 50, y: 0 }]);
  });
});

describe('moveWires', () => {
  const free = (x: number, y: number) => ({
    componentId: null,
    terminalIndex: 0,
    point: { x, y },
  });

  it('shifts a wire without detaching its ends', () => {
    const v = store().addComponent('battery', 0, 0)!;
    const r = store().addComponent('resistor', 400, 0)!;
    const w = store().addWire(
      { componentId: v, terminalIndex: 1, point: null },
      { componentId: r, terminalIndex: 0, point: null },
      [],
    );
    store().moveWires([w], 0, 40);
    const moved = store().doc.wires.find((x) => x.id === w)!;
    expect(moved.start.componentId).toBe(v);
    expect(moved.end.componentId).toBe(r);
    expect(moved.waypoints.length).toBe(1);
    expect(moved.waypoints[0].y).toBe(40);
  });

  it('leaves unselected wires alone', () => {
    const a = store().addWire(free(0, 0), free(100, 0), [{ x: 50, y: 0 }]);
    const b = store().addWire(free(0, 200), free(100, 200), [{ x: 50, y: 200 }]);
    store().moveWires([a], 10, 10);
    expect(store().doc.wires.find((w) => w.id === b)!.waypoints).toEqual([
      { x: 50, y: 200 },
    ]);
  });

  it('is a single undo step', () => {
    const w = store().addWire(free(0, 0), free(100, 0), [{ x: 50, y: 0 }]);
    store().moveWires([w], 0, 30);
    expect(store().doc.wires[0].waypoints).toEqual([{ x: 50, y: 30 }]);
    store().undo();
    expect(store().doc.wires[0].waypoints).toEqual([{ x: 50, y: 0 }]);
  });

  it('does nothing for a zero offset', () => {
    const w = store().addWire(free(0, 0), free(100, 0), [{ x: 50, y: 0 }]);
    const before = store().past.length;
    store().moveWires([w], 0, 0);
    expect(store().past.length).toBe(before);
  });
});

describe('setDoc (import)', () => {
  it('replaces the document but stays undoable', () => {
    store().addComponent('resistor', 0, 0);
    store().setDoc({ components: [], wires: [] });
    expect(store().doc.components.length).toBe(0);
    store().undo();
    expect(store().doc.components.length).toBe(1);
  });
});
