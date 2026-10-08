import { newId, snap, type CircuitComponent, type Point, type Wire } from '../models/circuit';
import { labelsFor } from '../core/labels';
import { useCircuitStore } from '../store/circuitStore';
import { useUiStore } from '../store/uiStore';

export interface Fragment {
  components: CircuitComponent[];
  wires: Wire[];
}

let clipboard: Fragment | null = null;

/** Copy the current selection into the in-memory clipboard. */
export function copySelection(): boolean {
  const doc = useCircuitStore.getState().doc;
  const ids = new Set(useUiStore.getState().selection);
  const components = doc.components.filter((c) => ids.has(c.id));
  if (components.length === 0) return false;

  const compIds = new Set(components.map((c) => c.id));
  const wires = doc.wires.filter(
    (w) =>
      (w.start.componentId && compIds.has(w.start.componentId)) ||
      (w.end.componentId && compIds.has(w.end.componentId)),
  );

  clipboard = {
    components: components.map((c) => ({ ...c })),
    wires: wires.map((w) => ({
      ...w,
      start: { ...w.start },
      end: { ...w.end },
      waypoints: w.waypoints.map((p) => ({ ...p })),
    })),
  };
  return true;
}

export function hasClipboard(): boolean {
  return clipboard !== null;
}

/** Clear the clipboard (used by New circuit). */
export function clearClipboard(): void {
  clipboard = null;
}

/**
 * Paste the clipboard. Components are placed so the fragment centroid lands
 * on `target` (falls back to the last known pointer / view center).
 * Returns ids of the pasted components.
 */
export function pasteClipboard(target?: Point): string[] {
  const frag = clipboard;
  if (!frag || frag.components.length === 0) return [];

  const store = useCircuitStore.getState();
  const doc = store.doc;

  const cx =
    frag.components.reduce((s, c) => s + c.x, 0) / frag.components.length;
  const cy =
    frag.components.reduce((s, c) => s + c.y, 0) / frag.components.length;

  const dest = target ?? defaultPasteTarget();
  // Nudge two grid cells so a paste at a resting cursor doesn't land exactly
  // on top of the copied parts.
  const dx = snap(dest.x - cx + 20);
  const dy = snap(dest.y - cy + 20);

  const labels = labelsFor(doc, frag.components.map((c) => c.type));
  const idMap = new Map<string, string>();
  const created: CircuitComponent[] = frag.components.map((c, i) => {
    const id = newId(c.type);
    idMap.set(c.id, id);
    return {
      ...c,
      id,
      label: labels[i],
      x: snap(c.x + dx),
      y: snap(c.y + dy),
    };
  });

  const createdWires: Wire[] = [];
  for (const w of frag.wires) {
    const s = w.start.componentId ? idMap.get(w.start.componentId) : null;
    const e = w.end.componentId ? idMap.get(w.end.componentId) : null;
    if (w.start.componentId && !s) continue;
    if (w.end.componentId && !e) continue;
    if (!w.start.componentId && !w.end.componentId) continue;
    createdWires.push({
      id: newId('wire'),
      start: {
        componentId: s ?? null,
        terminalIndex: w.start.terminalIndex,
        point: w.start.point
          ? { x: snap(w.start.point.x + dx), y: snap(w.start.point.y + dy) }
          : null,
      },
      end: {
        componentId: e ?? null,
        terminalIndex: w.end.terminalIndex,
        point: w.end.point
          ? { x: snap(w.end.point.x + dx), y: snap(w.end.point.y + dy) }
          : null,
      },
      waypoints: w.waypoints.map((p) => ({ x: snap(p.x + dx), y: snap(p.y + dy) })),
    });
  }

  store.commit((d) => {
    d.components.push(...created);
    d.wires.push(...createdWires);
  });
  useUiStore.getState().select(created.map((c) => c.id));
  return created.map((c) => c.id);
}

function defaultPasteTarget(): Point {
  const ui = useUiStore.getState();
  const pointer = getLastPointerWorld();
  if (pointer) return pointer;
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  return { x: (w / 2 - ui.panX) / ui.zoom, y: (h / 2 - ui.panY) / ui.zoom };
}

/** Latest pointer position in world units, maintained by the canvas. */
let lastPointerWorld: Point | null = null;

export function setLastPointerWorld(p: Point | null): void {
  lastPointerWorld = p;
}

export function getLastPointerWorld(): Point | null {
  return lastPointerWorld;
}
