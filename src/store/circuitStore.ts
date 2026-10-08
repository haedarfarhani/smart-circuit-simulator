import { create } from 'zustand';
import {
  cloneDoc,
  EMPTY_DOC,
  newId,
  snap,
  snapPoint,
  type CircuitComponent,
  type CircuitDoc,
  type ComponentType,
  type Point,
  type Rotation,
  type Wire,
  type WireEndpoint,
  type WireJunction,
} from '../models/circuit';
import { SYMBOLS } from '../core/symbols';
import { labelsFor } from '../core/labels';
import { offsetWire } from '../core/wirePath';

const HISTORY_LIMIT = 100;
const DOC_STORAGE_KEY = 'circuit-lab:doc';

export interface CircuitState {
  doc: CircuitDoc;
  past: CircuitDoc[];
  future: CircuitDoc[];
  /** ms timestamp of the last committed change (drives the status bar) */
  lastChange: number;
  savedAt: number | null;

  commit(mutate: (doc: CircuitDoc) => void): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;

  addComponent(type: ComponentType, x: number, y: number): string | null;
  addComponentsAtCenter(
    type: ComponentType,
    center: Point,
  ): string | null;
  updateComponents(ids: string[], patch: Partial<CircuitComponent>): void;
  moveComponents(ids: string[], dx: number, dy: number): void;
  moveWires(ids: string[], dx: number, dy: number): void;
  rotateComponents(ids: string[]): void;
  deleteElements(ids: string[]): void;
  duplicateComponents(ids: string[]): string[];
  addWire(
    start: WireEndpoint,
    end: WireEndpoint,
    waypoints: Point[],
    junctions?: WireJunction[],
  ): string;
  updateWire(id: string, patch: Partial<Wire>): void;
  setDoc(doc: CircuitDoc): void;
  newCircuit(): void;
  markSaved(): void;
}

function loadDoc(): CircuitDoc {
  try {
    if (typeof localStorage === 'undefined') return cloneDoc(EMPTY_DOC);
    const raw = localStorage.getItem(DOC_STORAGE_KEY);
    if (!raw) return cloneDoc(EMPTY_DOC);
    const parsed = JSON.parse(raw) as CircuitDoc;
    if (!Array.isArray(parsed.components) || !Array.isArray(parsed.wires)) {
      return cloneDoc(EMPTY_DOC);
    }
    return cloneDoc(parsed);
  } catch {
    return cloneDoc(EMPTY_DOC);
  }
}

export function persistDoc(doc: CircuitDoc): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(DOC_STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // storage may be unavailable (private mode) — saving is best-effort
  }
}

export const useCircuitStore = create<CircuitState>((set, get) => ({
  doc: loadDoc(),
  past: [],
  future: [],
  lastChange: 0,
  savedAt: null,

  commit(mutate) {
    const { doc, past } = get();
    const next = cloneDoc(doc);
    mutate(next);
    set({
      doc: next,
      past: [...past, cloneDoc(doc)].slice(-HISTORY_LIMIT),
      future: [],
      lastChange: Date.now(),
    });
  },

  undo() {
    const { doc, past, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      doc: prev,
      past: past.slice(0, -1),
      future: [cloneDoc(doc), ...future].slice(0, HISTORY_LIMIT),
      lastChange: Date.now(),
    });
  },

  redo() {
    const { doc, past, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      doc: next,
      past: [...past, cloneDoc(doc)].slice(-HISTORY_LIMIT),
      future: future.slice(1),
      lastChange: Date.now(),
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  addComponent(type, x, y) {
    const { doc } = get();
    const label = labelsFor(doc, [type])[0];
    const comp: CircuitComponent = {
      id: newId(type),
      type,
      x: snap(x),
      y: snap(y),
      rotation: 0,
      label,
      value: SYMBOLS[type].defaultValue,
    };
    if (SYMBOLS[type].defaultInductance !== undefined) {
      comp.inductance = SYMBOLS[type].defaultInductance;
    }
    get().commit((d) => {
      d.components.push(comp);
    });
    return comp.id;
  },

  addComponentsAtCenter(type, center) {
    return get().addComponent(type, center.x, center.y);
  },

  updateComponents(ids, patch) {
    const idSet = new Set(ids);
    get().commit((d) => {
      for (const c of d.components) {
        if (idSet.has(c.id)) Object.assign(c, patch);
      }
    });
  },

  moveComponents(ids, dx, dy) {
    if (dx === 0 && dy === 0) return;
    const idSet = new Set(ids);
    get().commit((d) => {
      // Wires are not edited here: attached ends recompute from terminal
      // positions at render time, free ends stay where the user left them.
      for (const c of d.components) {
        if (idSet.has(c.id)) {
          c.x = snap(c.x + dx);
          c.y = snap(c.y + dy);
        }
      }
    });
  },

  /**
   * Shift whole wires without detaching them. Attached ends stay on their
   * terminals; only the wire's own bend points (and any free end) move, which
   * is how a wire is pulled off a component it happens to run over.
   */
  moveWires(ids, dx, dy) {
    if (dx === 0 && dy === 0) return;
    const idSet = new Set(ids);
    get().commit((d) => {
      d.wires = d.wires.map((w) =>
        idSet.has(w.id) ? offsetWire(d, w, dx, dy) : w,
      );
    });
  },

  rotateComponents(ids) {
    const idSet = new Set(ids);
    get().commit((d) => {
      for (const c of d.components) {
        if (idSet.has(c.id)) {
          c.rotation = (((c.rotation + 90) % 360) as Rotation) || 0;
        }
      }
    });
  },

  deleteElements(ids) {
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    get().commit((d) => {
      d.components = d.components.filter((c) => !idSet.has(c.id));
      d.wires = d.wires.filter(
        (w) =>
          !idSet.has(w.id) &&
          (!w.start.componentId || !idSet.has(w.start.componentId)) &&
          (!w.end.componentId || !idSet.has(w.end.componentId)),
      );
    });
  },

  duplicateComponents(ids) {
    const { doc } = get();
    const idSet = new Set(ids);
    const source = doc.components.filter((c) => idSet.has(c.id));
    if (source.length === 0) return [];
    const labels = labelsFor(doc, source.map((c) => c.type));
    const created: CircuitComponent[] = source.map((c, i) => ({
      ...c,
      id: newId(c.type),
      label: labels[i],
      x: snap(c.x + 40),
      y: snap(c.y + 40),
    }));
    // duplicate wires whose both ends are inside the copied set
    const newWires: Wire[] = [];
    const remap = new Map(source.map((c, i) => [c.id, created[i].id]));
    for (const w of doc.wires) {
      const s = w.start.componentId ? remap.get(w.start.componentId) : undefined;
      const e = w.end.componentId ? remap.get(w.end.componentId) : undefined;
      if (w.start.componentId && !s) continue;
      if (w.end.componentId && !e) continue;
      if (!w.start.componentId && !w.end.componentId) continue;
      newWires.push({
        id: newId('wire'),
        start: {
          componentId: w.start.componentId ? s ?? null : null,
          terminalIndex: w.start.terminalIndex,
          point: w.start.point ? { ...w.start.point, x: w.start.point.x + 40, y: w.start.point.y + 40 } : null,
        },
        end: {
          componentId: w.end.componentId ? e ?? null : null,
          terminalIndex: w.end.terminalIndex,
          point: w.end.point ? { ...w.end.point, x: w.end.point.x + 40, y: w.end.point.y + 40 } : null,
        },
        waypoints: w.waypoints.map((p) => ({ x: p.x + 40, y: p.y + 40 })),
      });
    }
    get().commit((d) => {
      d.components.push(...created);
      d.wires.push(...newWires);
    });
    return created.map((c) => c.id);
  },

  /**
   * Create a wire. `junctions` attach it to the middle of existing wires: the
   * attachment point is inserted into those wires' waypoints so the solver
   * unions them into a single node — all in one undo step.
   */
  addWire(start, end, waypoints, junctions = []) {
    const wire: Wire = {
      id: newId('wire'),
      start: normalizeEndpoint(start),
      end: normalizeEndpoint(end),
      waypoints: waypoints.map((p) => snapPoint(p)),
    };
    get().commit((d) => {
      for (const j of junctions) {
        const target = d.wires.find((w) => w.id === j.wireId);
        if (!target) continue;
        const p = snapPoint(j.point);
        if (target.waypoints.some((w) => w.x === p.x && w.y === p.y)) continue;
        const at = Math.max(0, Math.min(j.insertIndex, target.waypoints.length));
        target.waypoints.splice(at, 0, p);
      }
      d.wires.push(wire);
    });
    return wire.id;
  },

  updateWire(id, patch) {
    get().commit((d) => {
      const w = d.wires.find((x) => x.id === id);
      if (w) Object.assign(w, patch);
    });
  },

  setDoc(doc) {
    const { doc: current, past } = get();
    set({
      doc: cloneDoc(doc),
      past: [...past, cloneDoc(current)].slice(-HISTORY_LIMIT),
      future: [],
      lastChange: Date.now(),
    });
  },

  newCircuit() {
    const { doc, past } = get();
    set({
      doc: cloneDoc(EMPTY_DOC),
      past: [...past, cloneDoc(doc)].slice(-HISTORY_LIMIT),
      future: [],
      lastChange: Date.now(),
    });
  },

  markSaved() {
    set({ savedAt: Date.now() });
  },
}));

function normalizeEndpoint(e: WireEndpoint): WireEndpoint {
  if (e.componentId) return { ...e, point: null };
  return { ...e, componentId: null, point: e.point ? snapPoint(e.point) : null };
}

export function selectedComponents(
  doc: CircuitDoc,
  ids: string[],
): CircuitComponent[] {
  const set = new Set(ids);
  return doc.components.filter((c) => set.has(c.id));
}

export function selectedWires(doc: CircuitDoc, ids: string[]): Wire[] {
  const set = new Set(ids);
  return doc.wires.filter((w) => set.has(w.id));
}
