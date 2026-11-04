/**
 * Hover-card art for digital components.
 *
 * The realistic-art card (RealPartArt) has no entry for digital devices —
 * its fallback draws nothing but a shadow. Digital parts instead show their
 * schematic symbol (the same dynamic body that renders on the canvas) plus
 * a PIN GUIDE: every pin with its number, name and direction, using the
 * same pin order as the wiring system and the on-symbol numbering.
 */

import type { CircuitComponent } from '../../models/circuit';
import { SYMBOLS } from '../../core/symbols';
import { devicePins } from '../../core/digital/devices';
import { isDigitalType, resolveDigitalCompParams } from '../../core/digital/types';
import { digitalBodyFor } from '../../core/digitalSymbols';

/** Schematic art of the component, fit to its own extents. */
export function DigitalPartArt({ comp }: { comp: CircuitComponent }) {
  const def = SYMBOLS[comp.type];
  const pad = 10;
  const vb = `${-def.w / 2 - pad} ${-def.h / 2 - pad} ${def.w + pad * 2} ${def.h + pad * 2}`;
  return (
    <svg
      viewBox={vb}
      className="real-part-svg digital-part-svg"
      role="img"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {digitalBodyFor(comp)}
    </svg>
  );
}

/** Ordered pin list of the component: number, name, direction. */
export function digitalPinList(comp: CircuitComponent): {
  number: number;
  name: string;
  dir: 'in' | 'out';
}[] {
  const params = resolveDigitalCompParams(comp);
  return devicePins(comp.type, params).map((p, i) => ({
    number: i + 1,
    name: p.name,
    dir: p.dir,
  }));
}

/** Pin guide legend under the hover art. */
export function DigitalPinGuide({ comp }: { comp: CircuitComponent }) {
  if (!isDigitalType(comp.type)) return null;
  const pins = digitalPinList(comp);
  if (pins.length === 0) return null;
  return (
    <div className="digital-pin-guide" role="list" aria-label="Pin guide">
      <div className="digital-pin-guide-head">
        <span>Pins</span>
        <span>{pins.length}</span>
      </div>
      <div className="digital-pin-guide-grid">
        {pins.map((p) => (
          <span key={p.number} className="digital-pin-chip" role="listitem">
            <b className="pin-num">{p.number}</b>
            <span className="pin-name">{p.name}</span>
            <i className={`pin-dir pin-dir-${p.dir}`}>{p.dir === 'in' ? 'IN' : 'OUT'}</i>
          </span>
        ))}
      </div>
    </div>
  );
}
