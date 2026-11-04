/**
 * Digital component symbols.
 *
 * Pin geometry comes straight from the device definitions (`devices.ts`) so
 * the schematic symbol, the topology builder and the kernel all index the
 * SAME ordered pin list. Bodies for configurable-width devices are rendered
 * per component instance through `digitalBodyFor`; the static `body` field
 * is a fallback preview built from the type's default parameters.
 */

import type { ReactNode } from 'react';
import type { CircuitComponent, ComponentType, TerminalDef } from '../models/circuit';
import type { LibraryCategory, SymbolDef } from './symbols';
import { devicePins, ALU_OPS, type DevicePinDef } from './digital/devices';
import { DIGITAL_DEFAULTS, isDigitalType, resolveDigitalCompParams } from './digital/types';
import type { LogicValue } from './digital/logic';

// ---------------------------------------------------------------------------
// Shared style helpers (match the .sym-* classes used by analog symbols)
// ---------------------------------------------------------------------------

function dline(x1: number, y1: number, x2: number, y2: number, key?: string): ReactNode {
  return <line key={key} className="sym-line" x1={x1} y1={y1} x2={x2} y2={y2} />;
}

function dtext(
  x: number,
  y: number,
  text: string,
  anchor: 'start' | 'middle' | 'end' = 'middle',
  size = 7,
  key?: string,
): ReactNode {
  return (
    <text
      key={key}
      className="sym-text"
      x={x}
      y={y}
      fontSize={size}
      textAnchor={anchor}
      dominantBaseline="middle"
    >
      {text}
    </text>
  );
}

/** Convert a device pin to a schematic terminal (drops kernel-only fields). */
function toTerminal(p: DevicePinDef): TerminalDef {
  return { x: p.x, y: p.y, dx: p.dx, dy: p.dy };
}

/** Ordered terminals for one component instance. */
export function digitalTerminalDefs(comp: CircuitComponent): TerminalDef[] {
  return devicePins(comp.type, resolveDigitalCompParams(comp)).map(toTerminal);
}

// ---------------------------------------------------------------------------
// State visualization palette (readable in both themes, never color alone)
// ---------------------------------------------------------------------------

/** Fill/stroke colors per logic state — used by canvas overlays and UI. */
export const LOGIC_STATE_COLORS: Record<LogicValue, string> = {
  '0': 'var(--text-faint)',
  '1': 'var(--status-success, #22c55e)',
  X: 'var(--status-warning, #f59e0b)',
  Z: 'var(--status-signal, #a855f7)',
};

// ---------------------------------------------------------------------------
// Gate bodies (distinctive IEEE-style shapes)
// ---------------------------------------------------------------------------

type GateKind = 'and' | 'or' | 'xor' | 'not' | 'buffer';

function gatePinsOf(inputCount: number): DevicePinDef[] {
  const start = -((inputCount - 1) * 20) / 2;
  return Array.from({ length: inputCount }, (_, i) => ({
    name: `IN${i}`,
    dir: 'in' as const,
    x: -50,
    y: start + i * 20,
    dx: -1 as const,
    dy: 0 as const,
  }));
}

function gateBody(kind: GateKind, inputCount: number, bubble: boolean): ReactNode {
  const pins = gatePinsOf(inputCount);
  const halfH = Math.max(20, (inputCount - 1) * 10 + 10);
  const nodes: ReactNode[] = [];

  // Input leads up to the body edge.
  const leadEndX = kind === 'or' || kind === 'xor' ? -22 : -30;
  pins.forEach((p, i) => {
    nodes.push(dline(p.x, p.y, leadEndX, p.y, `in${i}`));
  });

  if (kind === 'and') {
    nodes.push(
      <path
        key="body"
        className="sym-line"
        d={`M -30 ${-halfH} L -2 ${-halfH} A ${halfH} ${halfH} 0 0 1 -2 ${halfH} L -30 ${halfH} Z`}
        fill="none"
        strokeLinejoin="round"
      />,
    );
  } else if (kind === 'or' || kind === 'xor') {
    nodes.push(
      <path
        key="body"
        className="sym-line"
        d={`M -30 ${-halfH} Q 14 ${-halfH} 32 0 Q 14 ${halfH} -30 ${halfH} Q -16 0 -30 ${-halfH} Z`}
        fill="none"
        strokeLinejoin="round"
      />,
    );
    if (kind === 'xor') {
      nodes.push(
        <path
          key="extra"
          className="sym-line"
          d={`M -38 ${-halfH} Q -24 0 -38 ${halfH}`}
          fill="none"
          strokeLinecap="round"
        />,
      );
    }
  } else {
    // not / buffer: triangle
    nodes.push(
      <path
        key="body"
        className="sym-line"
        d={`M -30 -18 L 14 0 L -30 18 Z`}
        fill="none"
        strokeLinejoin="round"
      />,
    );
  }

  const outX = kind === 'and' ? halfH - 2 : kind === 'or' || kind === 'xor' ? 32 : 14;
  if (bubble) {
    nodes.push(<circle key="bub" className="sym-line" cx={outX + 6} cy={0} r={5} fill="var(--canvas-bg)" />);
    nodes.push(dline(outX + 11, 0, 50, 0, 'out'));
  } else {
    nodes.push(dline(outX, 0, 50, 0, 'out'));
  }
  return <>{nodes}</>;
}

// ---------------------------------------------------------------------------
// Boxed device body (mux, decoder, ALU, flip-flops, registers…)
// ---------------------------------------------------------------------------

interface BoxOptions {
  /** title text inside the box */
  title: string;
  /** hide pin name labels (too dense) */
  hideLabels?: boolean;
  /** draw the clock-edge triangle on pins named CLK */
  clockEdge?: boolean;
  /** invert labels for active-low pins (bar overlay is drawn as "/" prefix) */
  sublabel?: string;
}

function boxedBody(comp: CircuitComponent, opts: BoxOptions): ReactNode {
  const params = resolveDigitalCompParams(comp);
  const pins = devicePins(comp.type, params);
  const ins = pins.filter((p) => p.dir === 'in');
  const outs = pins.filter((p) => p.dir === 'out');

  const ys = [
    ...ins.map((p) => p.y),
    ...outs.map((p) => p.y),
    ...pins.filter((p) => p.dy !== 0).map((p) => p.y + (p.dy > 0 ? -14 : 14)),
    ...pins.filter((p) => p.dy !== 0).map((p) => p.x),
  ];
  const top = Math.min(...ys, -20) - 14;
  const bottom = Math.max(...ys, 20) + 14;
  const left = -38;
  const right = 38;

  const nodes: ReactNode[] = [
    <rect
      key="box"
      className="sym-line"
      x={left}
      y={top}
      width={right - left}
      height={bottom - top}
      rx={3}
      fill="var(--canvas-bg)"
    />,
    dtext(0, top + 10, opts.title, 'middle', 8, 'title'),
  ];
  if (opts.sublabel) {
    nodes.push(dtext(0, bottom - 8, opts.sublabel, 'middle', 5.5, 'sub'));
  }

  pins.forEach((p, i) => {
    if (p.dx === -1) {
      // left-side input
      nodes.push(dline(p.x, p.y, left, p.y, `s${i}`));
      if (!opts.hideLabels) {
        nodes.push(dtext(left + 3, p.y, p.name, 'start', 6, `l${i}`));
      }
      if (opts.clockEdge && p.name === 'CLK') {
        nodes.push(
          <path
            key={`clk${i}`}
            className="sym-line"
            d={`M ${left} ${p.y - 5} L ${left + 7} ${p.y} L ${left} ${p.y + 5} Z`}
            fill="var(--sym)"
          />,
        );
      }
    } else if (p.dx === 1) {
      nodes.push(dline(right, p.y, p.x, p.y, `s${i}`));
      if (!opts.hideLabels) {
        nodes.push(dtext(right - 3, p.y, p.name, 'end', 6, `l${i}`));
      }
    } else if (p.dy === 1) {
      // bottom-side input
      nodes.push(dline(p.x, p.y, p.x, bottom, `s${i}`));
      if (!opts.hideLabels) {
        nodes.push(dtext(p.x, bottom - 5, p.name, 'middle', 5.5, `l${i}`));
      }
    } else if (p.dy === -1) {
      nodes.push(dline(p.x, p.y, p.x, top, `s${i}`));
      if (!opts.hideLabels) {
        nodes.push(dtext(p.x, top + 6, p.name, 'middle', 5.5, `l${i}`));
      }
    }
  });

  return <>{nodes}</>;
}

// ---------------------------------------------------------------------------
// Seven-segment display body (segment states are a live overlay)
// ---------------------------------------------------------------------------

/** Segment outlines (A,B,C,D,E,F,G,DP) shared by the static body and the
 * live overlay that lights them from real electrical currents. */
export const SEVEN_SEG_PATHS: { key: string; d: string }[] = (() => {
  const hSeg = (cx: number, cy: number, h = 12, t = 5): string =>
    `M ${cx - h} ${cy} L ${cx - h + t} ${cy - t} L ${cx + h - t} ${cy - t} L ${cx + h} ${cy} L ${cx + h - t} ${cy + t} L ${cx - h + t} ${cy + t} Z`;
  const vSeg = (cx: number, cy: number, h = 12, t = 5): string =>
    `M ${cx} ${cy - h} L ${cx + t} ${cy - h + t} L ${cx + t} ${cy + h - t} L ${cx} ${cy + h} L ${cx - t} ${cy + h - t} L ${cx - t} ${cy - h + t} Z`;
  return [
    { key: 'A', d: hSeg(3, -44) },
    { key: 'B', d: vSeg(20, -22) },
    { key: 'C', d: vSeg(20, 22) },
    { key: 'D', d: hSeg(3, 44) },
    { key: 'E', d: vSeg(-14, 22) },
    { key: 'F', d: vSeg(-14, -22) },
    { key: 'G', d: hSeg(3, 0) },
    { key: 'DP', d: hSeg(28, 44, 7, 3.5) },
  ];
})();

/**
 * Display schematic: a tall body whose left edge spans every segment pin
 * (the old body was shorter than the pin column, leaving the A and DP
 * leads floating), with each lead carrying its pin NUMBER (1–8, 9 = COM)
 * just outside the body and its pin NAME just inside — the usual schematic
 * convention. Pin order/indices are unchanged from the electrical model:
 * terminals 0–7 are A..DP on the left, terminal 8 is COM at the bottom.
 */
function sevenSegBody(): ReactNode {
  const off = 'var(--sym-faint, rgba(128,128,128,0.25))';
  const nodes: ReactNode[] = [];

  // Body FIRST: it carries an opaque fill, so every label drawn after it
  // stays visible.
  nodes.push(
    <rect
      key="body"
      className="sym-line"
      x={-36}
      y={-80}
      width={72}
      height={160}
      rx={6}
      fill="var(--canvas-bg)"
    />,
  );

  // Segment pins: number outside the body edge, name inside.
  const segNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'];
  segNames.forEach((name, i) => {
    const y = -70 + i * 20;
    nodes.push(dline(-50, y, -36, y, `stub-${name}`));
    nodes.push(
      <text
        key={`num-${name}`}
        x={-39}
        y={y - 3}
        fontSize={5.5}
        textAnchor="end"
        dominantBaseline="middle"
        fill="var(--text-faint)"
        fontFamily="var(--font-mono)"
      >
        {i + 1}
      </text>,
    );
    nodes.push(
      <text
        key={`name-${name}`}
        x={-32}
        y={y}
        fontSize={6}
        textAnchor="start"
        dominantBaseline="middle"
        fill="var(--sym)"
        fontFamily="var(--font-mono)"
      >
        {name}
      </text>,
    );
  });

  // Common terminal at the bottom: pin 9.
  nodes.push(dline(0, 80, 0, 90, 'stub-COM'));
  nodes.push(
    <text
      key="num-COM"
      x={3.5}
      y={86}
      fontSize={5.5}
      textAnchor="start"
      dominantBaseline="middle"
      fill="var(--text-faint)"
      fontFamily="var(--font-mono)"
    >
      9
    </text>,
  );
  nodes.push(
    <text
      key="name-COM"
      x={0}
      y={72}
      fontSize={6}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="var(--sym)"
      fontFamily="var(--font-mono)"
    >
      COM
    </text>,
  );

  // Dim segment outlines (the live overlay lights them from real current).
  SEVEN_SEG_PATHS.forEach((s) => {
    nodes.push(<path key={`seg-${s.key}`} d={s.d} fill={off} stroke="none" />);
  });

  return <>{nodes}</>;
}

// ---------------------------------------------------------------------------
// Small source / sink bodies
// ---------------------------------------------------------------------------

function logicInputBody(): ReactNode {
  return (
    <>
      {dline(20, 0, 50, 0, 'out')}
      <rect key="body" className="sym-line" x={-20} y={-20} width={40} height={40} rx={6} fill="var(--canvas-bg)" />
      <text key="v" className="sym-text logic-input-value" x={0} y={1} fontSize={13} textAnchor="middle" dominantBaseline="middle" data-state="0">
        0
      </text>
    </>
  );
}

function logicOutputBody(): ReactNode {
  return (
    <>
      {dline(-50, 0, -20, 0, 'in')}
      <rect key="body" className="sym-line" x={-20} y={-20} width={40} height={40} rx={6} fill="var(--canvas-bg)" />
      <text key="v" className="sym-text logic-output-value" x={0} y={1} fontSize={13} textAnchor="middle" dominantBaseline="middle">
        ?
      </text>
    </>
  );
}

function clockBody(): ReactNode {
  return (
    <>
      {dline(20, 0, 50, 0, 'out')}
      <rect key="body" className="sym-line" x={-20} y={-20} width={40} height={40} rx={6} fill="var(--canvas-bg)" />
      <path
        key="wave"
        className="sym-line"
        d="M -14 8 L -14 -8 L -4 -8 L -4 8 L 6 8 L 6 -8 L 14 -8"
        fill="none"
        strokeLinejoin="round"
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Dynamic body dispatch
// ---------------------------------------------------------------------------

/** The live body of a digital component (width/mode aware). */
export function digitalBodyFor(comp: CircuitComponent): ReactNode {
  switch (comp.type) {
    case 'and-gate':
      return gateBody('and', resolveDigitalCompParams(comp).inputCount, false);
    case 'nand-gate':
      return gateBody('and', resolveDigitalCompParams(comp).inputCount, true);
    case 'or-gate':
      return gateBody('or', resolveDigitalCompParams(comp).inputCount, false);
    case 'nor-gate':
      return gateBody('or', resolveDigitalCompParams(comp).inputCount, true);
    case 'xor-gate':
      return gateBody('xor', resolveDigitalCompParams(comp).inputCount, false);
    case 'xnor-gate':
      return gateBody('xor', resolveDigitalCompParams(comp).inputCount, true);
    case 'not-gate':
      return gateBody('not', 1, true);
    case 'buffer-gate':
      return gateBody('buffer', 1, false);
    case 'multiplexer':
      return boxedBody(comp, { title: 'MUX' });
    case 'demultiplexer':
      return boxedBody(comp, { title: 'DEMUX' });
    case 'decoder':
      return boxedBody(comp, { title: 'DEC' });
    case 'encoder':
      return boxedBody(comp, { title: 'ENC' });
    case 'half-adder':
      return boxedBody(comp, { title: 'Σ/2', sublabel: 'HA' });
    case 'full-adder':
      return boxedBody(comp, { title: 'Σ', sublabel: 'FA' });
    case 'adder':
      return boxedBody(comp, { title: 'Σ', sublabel: `RIPPLE ×${resolveDigitalCompParams(comp).width}` });
    case 'subtractor':
      return boxedBody(comp, { title: 'A−B', sublabel: `×${resolveDigitalCompParams(comp).width}` });
    case 'comparator':
      return boxedBody(comp, { title: 'CMP', sublabel: `${resolveDigitalCompParams(comp).width}-bit` });
    case 'alu':
      return boxedBody(comp, { title: 'ALU', sublabel: `${resolveDigitalCompParams(comp).width}-bit` });
    case 'sr-latch':
      return boxedBody(comp, { title: 'SR', sublabel: 'LATCH' });
    case 'd-latch':
      return boxedBody(comp, { title: 'D', sublabel: 'LATCH' });
    case 'sr-flip-flop':
      return boxedBody(comp, { title: 'SR', sublabel: 'FF', clockEdge: true });
    case 'd-flip-flop':
      return boxedBody(comp, { title: 'D', sublabel: 'FF', clockEdge: true });
    case 'jk-flip-flop':
      return boxedBody(comp, { title: 'JK', sublabel: 'FF', clockEdge: true });
    case 't-flip-flop':
      return boxedBody(comp, { title: 'T', sublabel: 'FF', clockEdge: true });
    case 'register':
      return boxedBody(comp, { title: 'REG', sublabel: `${resolveDigitalCompParams(comp).width}-bit` });
    case 'shift-register':
      return boxedBody(comp, {
        title: 'SHIFT',
        sublabel: resolveDigitalCompParams(comp).shiftMode.toUpperCase(),
      });
    case 'counter':
      return boxedBody(comp, {
        title: 'CTR',
        sublabel: resolveDigitalCompParams(comp).counterMode.toUpperCase(),
      });
    case 'bcd-to-seven-segment-decoder':
      return boxedBody(comp, { title: 'BCD', sublabel: '7-SEG' });
    case 'seven-segment-display':
      return sevenSegBody();
    case 'logic-input':
      return logicInputBody();
    case 'logic-output':
      return logicOutputBody();
    case 'clock-generator':
      return clockBody();
    default:
      return null;
  }
}

/** A synthetic component for library previews (no document instance). */
export function syntheticDigitalComp(type: ComponentType): CircuitComponent {
  const comp: CircuitComponent = {
    id: `preview:${type}`,
    type,
    x: 0,
    y: 0,
    rotation: 0,
    label: type,
    value: 0,
  };
  const d = DIGITAL_DEFAULTS[type];
  if (d) {
    if (d.family !== undefined) comp.logicFamily = d.family as string;
    if (d.inputCount !== undefined) comp.inputCount = d.inputCount as number;
    if (d.width !== undefined) comp.width = d.width as number;
    if (d.counterMode !== undefined) comp.counterMode = d.counterMode as CircuitComponent['counterMode'];
    if (d.shiftMode !== undefined) comp.shiftMode = d.shiftMode as CircuitComponent['shiftMode'];
    if (d.shiftDirection !== undefined) comp.shiftDirection = d.shiftDirection as CircuitComponent['shiftDirection'];
    if (d.commonType !== undefined) comp.commonType = d.commonType as CircuitComponent['commonType'];
  }
  return comp;
}

// ---------------------------------------------------------------------------
// Symbol table
// ---------------------------------------------------------------------------

interface EntrySpec {
  prefix: string;
  category: LibraryCategory;
  w: number;
  h: number;
  /** static preview body (uses default parameters) */
  body?: ReactNode;
}

const ENTRY: Record<string, EntrySpec> = {
  'and-gate': { prefix: 'U', category: 'digital-gates', w: 110, h: 80, body: gateBody('and', 2, false) },
  'or-gate': { prefix: 'U', category: 'digital-gates', w: 110, h: 80, body: gateBody('or', 2, false) },
  'not-gate': { prefix: 'U', category: 'digital-gates', w: 110, h: 60, body: gateBody('not', 1, true) },
  'nand-gate': { prefix: 'U', category: 'digital-gates', w: 110, h: 80, body: gateBody('and', 2, true) },
  'nor-gate': { prefix: 'U', category: 'digital-gates', w: 110, h: 80, body: gateBody('or', 2, true) },
  'xor-gate': { prefix: 'U', category: 'digital-gates', w: 114, h: 80, body: gateBody('xor', 2, false) },
  'xnor-gate': { prefix: 'U', category: 'digital-gates', w: 114, h: 80, body: gateBody('xor', 2, true) },
  'buffer-gate': { prefix: 'U', category: 'digital-gates', w: 110, h: 60, body: gateBody('buffer', 1, false) },
  multiplexer: { prefix: 'U', category: 'digital-combinational', w: 110, h: 150 },
  demultiplexer: { prefix: 'U', category: 'digital-combinational', w: 110, h: 150 },
  decoder: { prefix: 'U', category: 'digital-combinational', w: 110, h: 180 },
  encoder: { prefix: 'U', category: 'digital-combinational', w: 110, h: 180 },
  'half-adder': { prefix: 'U', category: 'digital-combinational', w: 110, h: 80 },
  'full-adder': { prefix: 'U', category: 'digital-combinational', w: 110, h: 90 },
  adder: { prefix: 'U', category: 'digital-combinational', w: 110, h: 190 },
  subtractor: { prefix: 'U', category: 'digital-combinational', w: 110, h: 190 },
  comparator: { prefix: 'U', category: 'digital-combinational', w: 110, h: 190 },
  alu: { prefix: 'U', category: 'digital-combinational', w: 110, h: 220 },
  'sr-latch': { prefix: 'U', category: 'digital-sequential', w: 110, h: 80 },
  'd-latch': { prefix: 'U', category: 'digital-sequential', w: 110, h: 80 },
  'sr-flip-flop': { prefix: 'U', category: 'digital-sequential', w: 110, h: 140 },
  'd-flip-flop': { prefix: 'U', category: 'digital-sequential', w: 110, h: 140 },
  'jk-flip-flop': { prefix: 'U', category: 'digital-sequential', w: 110, h: 140 },
  't-flip-flop': { prefix: 'U', category: 'digital-sequential', w: 110, h: 140 },
  register: { prefix: 'U', category: 'digital-sequential', w: 110, h: 140 },
  'shift-register': { prefix: 'U', category: 'digital-sequential', w: 110, h: 160 },
  counter: { prefix: 'U', category: 'digital-sequential', w: 110, h: 160 },
  'bcd-to-seven-segment-decoder': { prefix: 'U', category: 'digital-displays', w: 110, h: 160 },
  'seven-segment-display': { prefix: 'DSP', category: 'digital-displays', w: 110, h: 200, body: sevenSegBody() },
  'logic-input': { prefix: 'IN', category: 'digital-io', w: 80, h: 60, body: logicInputBody() },
  'logic-output': { prefix: 'OUT', category: 'digital-io', w: 80, h: 60, body: logicOutputBody() },
  'clock-generator': { prefix: 'CLK', category: 'digital-io', w: 80, h: 60, body: clockBody() },
};

function defForType(type: ComponentType): SymbolDef {
  const spec = ENTRY[type];
  if (!spec) throw new Error(`digital symbol missing for ${type}`);
  const previewComp = syntheticDigitalComp(type);
  return {
    type,
    prefix: spec.prefix,
    category: spec.category,
    defaultValue: 0,
    unit: '',
    w: spec.w,
    h: spec.h,
    terminals: digitalTerminalDefs(previewComp),
    terminalsFor: (comp) => digitalTerminalDefs(comp),
    body: spec.body ?? digitalBodyFor(previewComp) ?? <g />,
  };
}

/** All digital component symbols, spread into the main SYMBOLS table. */
export const DIGITAL_SYMBOLS: Partial<Record<ComponentType, SymbolDef>> = Object.fromEntries(
  Object.keys(ENTRY)
    .filter((t) => isDigitalType(t as ComponentType))
    .map((t) => [t, defForType(t as ComponentType)]),
) as Partial<Record<ComponentType, SymbolDef>>;

void ALU_OPS;
