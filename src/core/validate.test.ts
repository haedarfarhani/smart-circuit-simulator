import { describe, expect, it } from 'vitest';
import { validateDoc } from './validate';

describe('validateDoc', () => {
  it('accepts an empty document', () => {
    const res = validateDoc({ components: [], wires: [] });
    expect(res.ok).toBe(true);
    expect(res.doc).toEqual({ components: [], wires: [] });
  });

  it('normalizes a valid component', () => {
    const res = validateDoc({
      components: [
        {
          id: 'x',
          type: 'resistor',
          x: 10,
          y: -20,
          rotation: 45,
          label: '',
          value: 'oops',
        },
      ],
      wires: [],
    });
    expect(res.ok).toBe(true);
    const c = res.doc!.components[0];
    expect(c.rotation).toBe(0);
    expect(c.label).toBe('#1');
    expect(c.value).toBe(0);
  });

  it('rejects non-objects', () => {
    expect(validateDoc(null).ok).toBe(false);
    expect(validateDoc(42).ok).toBe(false);
    expect(validateDoc('hi').ok).toBe(false);
  });

  it('rejects missing arrays', () => {
    expect(validateDoc({}).ok).toBe(false);
    expect(validateDoc({ components: [] }).ok).toBe(false);
  });

  it('rejects unknown component types', () => {
    const res = validateDoc({
      components: [{ id: 'a', type: 'flux-capacitor', x: 0, y: 0 }],
      wires: [],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('unknown type');
  });

  it('rejects duplicate ids', () => {
    const res = validateDoc({
      components: [
        { id: 'a', type: 'resistor', x: 0, y: 0 },
        { id: 'a', type: 'resistor', x: 0, y: 0 },
      ],
      wires: [],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('duplicate');
  });

  it('rejects wires referencing unknown components', () => {
    const res = validateDoc({
      components: [],
      wires: [
        {
          id: 'w',
          start: { componentId: 'ghost', terminalIndex: 0, point: null },
          end: { componentId: null, terminalIndex: 0, point: { x: 0, y: 0 } },
        },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('unknown component');
  });

  it('rejects free ends without a position', () => {
    const res = validateDoc({
      components: [],
      wires: [
        {
          id: 'w',
          start: { componentId: null, terminalIndex: 0, point: null },
          end: { componentId: null, terminalIndex: 0, point: { x: 0, y: 0 } },
        },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('free end');
  });
});
