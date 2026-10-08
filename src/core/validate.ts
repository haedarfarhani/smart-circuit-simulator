import type { CircuitDoc, CircuitComponent, Wire, Point } from '../models/circuit';

export interface ValidationResult {
  ok: boolean;
  doc?: CircuitDoc;
  error?: string;
}

function isPoint(v: unknown): v is Point {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Point).x === 'number' &&
    typeof (v as Point).y === 'number'
  );
}

const COMPONENT_TYPES = new Set([
  'resistor',
  'capacitor',
  'lamp',
  'switch',
  'battery',
  'ground',
  'dcMotor',
  'solenoid',
  'diode',
  'led',
  'acVoltageSource',
  'currentSource',
  'acMotor',
]);

/**
 * Validate an arbitrary JSON value as a circuit document.
 * Returns a normalized, safe-to-render document or a human-readable error.
 */
export function validateDoc(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'expected a JSON object' };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.components)) {
    return { ok: false, error: '"components" must be an array' };
  }
  if (!Array.isArray(obj.wires)) {
    return { ok: false, error: '"wires" must be an array' };
  }

  const components: CircuitComponent[] = [];
  const seen = new Set<string>();
  for (const [i, c] of obj.components.entries()) {
    if (typeof c !== 'object' || c === null) {
      return { ok: false, error: `component #${i} is not an object` };
    }
    const comp = c as Partial<CircuitComponent>;
    if (typeof comp.id !== 'string' || comp.id === '') {
      return { ok: false, error: `component #${i} is missing an id` };
    }
    if (seen.has(comp.id)) {
      return { ok: false, error: `duplicate component id "${comp.id}"` };
    }
    seen.add(comp.id);
    if (!comp.type || !COMPONENT_TYPES.has(comp.type)) {
      return { ok: false, error: `component "${comp.id}" has unknown type "${String(comp.type)}"` };
    }
    if (typeof comp.x !== 'number' || typeof comp.y !== 'number') {
      return { ok: false, error: `component "${comp.id}" has invalid position` };
    }
    const rotation = [0, 90, 180, 270].includes(comp.rotation as number)
      ? comp.rotation
      : 0;
    components.push({
      id: comp.id,
      type: comp.type as CircuitComponent['type'],
      x: comp.x,
      y: comp.y,
      rotation: rotation as CircuitComponent['rotation'],
      label: typeof comp.label === 'string' && comp.label ? comp.label : `#${i + 1}`,
      value: typeof comp.value === 'number' && Number.isFinite(comp.value) ? comp.value : 0,
      ...(typeof comp.inductance === 'number' && Number.isFinite(comp.inductance)
        ? { inductance: comp.inductance }
        : {}),
      ...(typeof comp.frequency === 'number' && Number.isFinite(comp.frequency)
        ? { frequency: comp.frequency }
        : {}),
      ...(typeof comp.forwardVoltage === 'number' && Number.isFinite(comp.forwardVoltage)
        ? { forwardVoltage: comp.forwardVoltage }
        : {}),
      ...(typeof comp.color === 'string'
        ? { color: comp.color as CircuitComponent['color'] }
        : {}),
    });
  }

  const wires: Wire[] = [];
  for (const [i, w] of obj.wires.entries()) {
    if (typeof w !== 'object' || w === null) {
      return { ok: false, error: `wire #${i} is not an object` };
    }
    const wire = w as Partial<Wire>;
    if (typeof wire.id !== 'string' || wire.id === '') {
      return { ok: false, error: `wire #${i} is missing an id` };
    }
    for (const key of ['start', 'end'] as const) {
      const end = wire[key] as Wire['start'] | undefined;
      if (!end || typeof end !== 'object') {
        return { ok: false, error: `wire "${wire.id}" is missing "${key}"` };
      }
      if (end.componentId !== null && typeof end.componentId !== 'string') {
        return { ok: false, error: `wire "${wire.id}" has an invalid "${key}" endpoint` };
      }
      if (end.componentId && !seen.has(end.componentId)) {
        return {
          ok: false,
          error: `wire "${wire.id}" references unknown component "${end.componentId}"`,
        };
      }
      if (!end.componentId && !isPoint(end.point)) {
        return {
          ok: false,
          error: `wire "${wire.id}" has a free end without a position`,
        };
      }
    }
    wires.push({
      id: wire.id,
      start: { ...wire.start! },
      end: { ...wire.end! },
      waypoints: Array.isArray(wire.waypoints)
        ? wire.waypoints.filter(isPoint).map((p) => ({ ...p }))
        : [],
    });
  }

  return { ok: true, doc: { components, wires } };
}
