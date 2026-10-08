import type { CircuitDoc, CircuitComponent, ComponentType } from '../models/circuit';
import { SYMBOLS } from './symbols';

/**
 * Next designator for a type, e.g. R1, R2… based on existing labels.
 * Pure function so it is easy to test.
 */
export function nextLabel(doc: CircuitDoc, type: ComponentType): string {
  const prefix = SYMBOLS[type].prefix;
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const c of doc.components) {
    const m = re.exec(c.label);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${max + 1}`;
}

/** Labels for a set of components to add (avoids collisions within one op). */
export function labelsFor(
  doc: CircuitDoc,
  types: ComponentType[],
): string[] {
  let work: CircuitDoc = { components: [...doc.components], wires: [] };
  const out: string[] = [];
  for (const t of types) {
    const label = nextLabel(work, t);
    out.push(label);
    work = {
      ...work,
      components: [
        ...work.components,
        { id: label, type: t, x: 0, y: 0, rotation: 0, label, value: 0 },
      ],
    };
  }
  return out;
}

const SI_PREFIXES: [number, string][] = [
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
];

/** Format an engineering value: 4700 Ω → "4.7 kΩ", 0.000001 F → "1 µF". */
export function formatValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return `— ${unit}`;
  if (value === 0) return `0 ${unit}`.trim();
  const abs = Math.abs(value);
  let prefix = '';
  let scaled = value;
  for (const [threshold, p] of SI_PREFIXES) {
    if (abs >= threshold) {
      prefix = p;
      scaled = value / threshold;
      break;
    }
  }
  const num =
    Math.abs(scaled) >= 100
      ? scaled.toFixed(0)
      : Math.abs(scaled) >= 10
        ? scaled.toFixed(1).replace(/\.0$/, '')
        : scaled.toFixed(2).replace(/\.?0+$/, '');
  return `${num} ${prefix}${unit}`.trim();
}

/** Human description of a component used in the status bar. */
export function describeComponent(c: CircuitComponent): string {
  const def = SYMBOLS[c.type];
  return `${c.label} = ${formatValue(c.value, def.unit)}`;
}
