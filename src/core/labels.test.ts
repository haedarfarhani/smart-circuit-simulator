import { describe, expect, it } from 'vitest';
import { formatValue, labelsFor, nextLabel } from './labels';
import type { CircuitDoc } from '../models/circuit';

const empty: CircuitDoc = { components: [], wires: [] };

describe('nextLabel', () => {
  it('starts at 1 for a fresh document', () => {
    expect(nextLabel(empty, 'resistor')).toBe('R1');
    expect(nextLabel(empty, 'battery')).toBe('V1');
  });

  it('increments past existing labels', () => {
    const doc: CircuitDoc = {
      components: [
        { id: 'a', type: 'resistor', x: 0, y: 0, rotation: 0, label: 'R1', value: 10 },
        { id: 'b', type: 'resistor', x: 0, y: 0, rotation: 0, label: 'R7', value: 10 },
        { id: 'c', type: 'resistor', x: 0, y: 0, rotation: 0, label: 'R-other', value: 10 },
      ],
      wires: [],
    };
    expect(nextLabel(doc, 'resistor')).toBe('R8');
  });

  it('keeps numbering per prefix independent', () => {
    const doc: CircuitDoc = {
      components: [
        { id: 'a', type: 'resistor', x: 0, y: 0, rotation: 0, label: 'R3', value: 10 },
      ],
      wires: [],
    };
    expect(nextLabel(doc, 'capacitor')).toBe('C1');
  });
});

describe('labelsFor', () => {
  it('returns unique sequential labels for a batch', () => {
    const doc: CircuitDoc = {
      components: [
        { id: 'a', type: 'resistor', x: 0, y: 0, rotation: 0, label: 'R1', value: 10 },
      ],
      wires: [],
    };
    expect(labelsFor(doc, ['resistor', 'resistor', 'battery'])).toEqual([
      'R2',
      'R3',
      'V1',
    ]);
  });
});

describe('formatValue', () => {
  it('formats plain values', () => {
    expect(formatValue(100, 'Ω')).toBe('100 Ω');
    expect(formatValue(0, 'V')).toBe('0 V');
  });

  it('adds SI prefixes', () => {
    expect(formatValue(4700, 'Ω')).toBe('4.7 kΩ');
    expect(formatValue(1e-6, 'F')).toBe('1 µF');
    expect(formatValue(2.2e-3, 'F')).toBe('2.2 mF');
    expect(formatValue(1e6, 'Ω')).toBe('1 MΩ');
  });

  it('handles negative values', () => {
    expect(formatValue(-4700, 'Ω')).toBe('-4.7 kΩ');
  });
});
