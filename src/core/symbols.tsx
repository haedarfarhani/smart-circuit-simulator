import type { ReactNode } from 'react';
import { DEFAULT_SOLENOID_INDUCTANCE } from '../models/circuit';
import type { ComponentType, TerminalDef } from '../models/circuit';

/**
 * Standard IEC-style schematic symbols drawn in local space.
 * Local origin is the component center; leads run to terminals at ±40
 * (ground has a single terminal above the symbol).
 * Geometry is in world units where the grid step is 10.
 */

export const LEAD_LEN = 40;

export const TERMINAL_LEFT: TerminalDef = { x: -LEAD_LEN, y: 0, dx: -1, dy: 0 };
export const TERMINAL_RIGHT: TerminalDef = { x: LEAD_LEN, y: 0, dx: 1, dy: 0 };
export const TERMINAL_TOP: TerminalDef = { x: 0, y: -LEAD_LEN, dx: 0, dy: -1 };

export type LibraryCategory =
  | 'passive'
  | 'sources'
  | 'switches'
  | 'actuators';

export interface SymbolDef {
  type: ComponentType;
  /** designator prefix: R, C, L, SW, V, GND */
  prefix: string;
  category: LibraryCategory;
  defaultValue: number;
  /** SI unit of value */
  unit: string;
  /** components that store energy magnetically carry an inductance (H) */
  defaultInductance?: number;
  /** hit/selection box size in world units */
  w: number;
  h: number;
  terminals: TerminalDef[];
  /** SVG body including leads, drawn around local origin */
  body: ReactNode;
}

/** Zigzag polyline for the resistor body. */
export const RESISTOR_BODY = [
  { x: -24, y: 0 },
  { x: -18, y: -10 },
  { x: -12, y: 10 },
  { x: -6, y: -10 },
  { x: 0, y: 10 },
  { x: 6, y: -10 },
  { x: 12, y: 10 },
  { x: 18, y: -10 },
  { x: 24, y: 0 },
]
  .map((p) => `${p.x},${p.y}`)
  .join(' ');

function polyline(points: string): ReactNode {
  return (
    <polyline
      className="sym-line"
      points={points}
      fill="none"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

function line(x1: number, y1: number, x2: number, y2: number): ReactNode {
  return <line className="sym-line" x1={x1} y1={y1} x2={x2} y2={y2} />;
}

/** Horizontal lead from x to the body edge at ±24. */
function leadLeft(): ReactNode {
  return line(-LEAD_LEN, 0, -24, 0);
}
function leadRight(): ReactNode {
  return line(24, 0, LEAD_LEN, 0);
}

export const SYMBOLS: Record<ComponentType, SymbolDef> = {
  resistor: {
    type: 'resistor',
    prefix: 'R',
    category: 'passive',
    defaultValue: 100,
    unit: 'Ω',
    w: 88,
    h: 32,
    terminals: [TERMINAL_LEFT, TERMINAL_RIGHT],
    body: (
      <>
        {leadLeft()}
        {leadRight()}
        {polyline(RESISTOR_BODY)}
      </>
    ),
  },
  capacitor: {
    type: 'capacitor',
    prefix: 'C',
    category: 'passive',
    defaultValue: 1e-6,
    unit: 'F',
    w: 88,
    h: 36,
    terminals: [TERMINAL_LEFT, TERMINAL_RIGHT],
    body: (
      <>
        {leadLeft()}
        {leadRight()}
        {line(-7, -14, -7, 14)}
        {line(7, -14, 7, 14)}
      </>
    ),
  },
  lamp: {
    type: 'lamp',
    prefix: 'L',
    category: 'passive',
    defaultValue: 60,
    unit: 'W',
    w: 88,
    h: 40,
    terminals: [TERMINAL_LEFT, TERMINAL_RIGHT],
    body: (
      <>
        {leadLeft()}
        {leadRight()}
        <circle className="sym-line" cx={0} cy={0} r={16} fill="none" />
        {line(-11.3, -11.3, 11.3, 11.3)}
        {line(-11.3, 11.3, 11.3, -11.3)}
      </>
    ),
  },
  switch: {
    type: 'switch',
    prefix: 'SW',
    category: 'switches',
    defaultValue: 1,
    unit: '',
    w: 88,
    h: 36,
    terminals: [TERMINAL_LEFT, TERMINAL_RIGHT],
    body: (
      <>
        {leadLeft()}
        {leadRight()}
        <circle className="sym-fill" cx={-24} cy={0} r={3.5} />
        <circle className="sym-fill" cx={24} cy={0} r={3.5} />
        {/* lever drawn by SwitchBody so it can reflect open/closed state */}
      </>
    ),
  },
  battery: {
    type: 'battery',
    prefix: 'V',
    category: 'sources',
    defaultValue: 9,
    unit: 'V',
    w: 88,
    h: 44,
    terminals: [TERMINAL_LEFT, TERMINAL_RIGHT],
    body: (
      <>
        <line className="sym-line" x1={-LEAD_LEN} y1={0} x2={-9} y2={0} />
        <line className="sym-line" x1={9} y1={0} x2={LEAD_LEN} y2={0} />
        {/* two cells: long plate = +, short plate = − */}
        {line(-9, -16, -9, 16)}
        {line(-3, -8, -3, 8)}
        {line(3, -16, 3, 16)}
        {line(9, -8, 9, 8)}
        <text className="sym-text" x={-24} y={-10}>
          +
        </text>
      </>
    ),
  },
  ground: {
    type: 'ground',
    prefix: 'GND',
    category: 'sources',
    defaultValue: 0,
    unit: '',
    w: 48,
    h: 56,
    terminals: [TERMINAL_TOP],
    body: (
      <>
        {line(0, -LEAD_LEN, 0, -14)}
        {line(-22, -14, 22, -14)}
        {line(-14, -6, 14, -6)}
        {line(-7, 2, 7, 2)}
      </>
    ),
  },
  dcMotor: {
    type: 'dcMotor',
    prefix: 'M',
    category: 'actuators',
    defaultValue: 10,
    unit: 'Ω',
    w: 100,
    h: 80,
    terminals: [TERMINAL_LEFT, TERMINAL_RIGHT],
    body: (
      <>
        {line(-LEAD_LEN, 0, -20, 0)}
        {line(20, 0, LEAD_LEN, 0)}
        <circle className="sym-line" cx={0} cy={0} r={28} fill="none" />
        <circle className="sym-fill" cx={0} cy={0} r={12} />
        <path
          className="sym-line"
          d="M -12 -12 L 12 12 M -12 12 L 12 -12"
          strokeWidth="2"
        />
        <text className="sym-text" x={-35} y={30} fontSize="10">
          M
        </text>
      </>
    ),
  },
  solenoid: {
    type: 'solenoid',
    prefix: 'SOL',
    category: 'actuators',
    defaultValue: 50,
    unit: 'Ω',
    defaultInductance: DEFAULT_SOLENOID_INDUCTANCE,
    w: 100,
    h: 70,
    terminals: [TERMINAL_LEFT, TERMINAL_RIGHT],
    body: (
      <>
        {line(-LEAD_LEN, 0, -25, 0)}
        {line(25, 0, LEAD_LEN, 0)}
        <rect className="sym-line" x={-25} y={-20} width={50} height={40} fill="none" rx={3} />
        <path
          className="sym-line"
          d="M -20 -15 Q 0 -25 20 -15 M -20 0 Q 0 -10 20 0 M -20 15 Q 0 5 20 15"
          fill="none"
        />
        <line className="sym-line" x1={-8} y1={-20} x2={-8} y2={20} strokeDasharray="4 2" />
        <text className="sym-text" x={-40} y={30} fontSize="10">
          SOL
        </text>
      </>
    ),
  },
  diode: {
    type: 'diode',
    prefix: 'D',
    category: 'passive',
    defaultValue: 0.7,
    unit: 'V',
    w: 88,
    h: 36,
    terminals: [TERMINAL_LEFT, TERMINAL_RIGHT],
    body: (
      <>
        {line(-LEAD_LEN, 0, -14, 0)}
        {line(14, 0, LEAD_LEN, 0)}
        {/* Anode triangle pointing right to Cathode */}
        <polygon points="-14,-14 14,0 -14,14" className="sym-fill" fill="currentColor" />
        {/* Cathode bar */}
        <line className="sym-line" x1={14} y1={-14} x2={14} y2={14} strokeWidth={2.4} />
      </>
    ),
  },
  led: {
    type: 'led',
    prefix: 'LED',
    category: 'passive',
    defaultValue: 2.0,
    unit: 'V',
    w: 88,
    h: 44,
    terminals: [TERMINAL_LEFT, TERMINAL_RIGHT],
    body: (
      <>
        {line(-LEAD_LEN, 0, -14, 0)}
        {line(14, 0, LEAD_LEN, 0)}
        {/* Diode body */}
        <polygon points="-14,-14 14,0 -14,14" className="sym-fill" fill="currentColor" />
        <line className="sym-line" x1={14} y1={-14} x2={14} y2={14} strokeWidth={2.4} />
        {/* Photon emission arrows */}
        <path d="M 0 -15 L 8 -24 M 5 -24 L 8 -24 L 8 -21" className="sym-line" strokeWidth={1.5} />
        <path d="M 8 -11 L 16 -20 M 13 -20 L 16 -20 L 16 -17" className="sym-line" strokeWidth={1.5} />
      </>
    ),
  },
  acVoltageSource: {
    type: 'acVoltageSource',
    prefix: 'VAC',
    category: 'sources',
    defaultValue: 12,
    unit: 'V',
    w: 88,
    h: 48,
    terminals: [TERMINAL_LEFT, TERMINAL_RIGHT],
    body: (
      <>
        {line(-LEAD_LEN, 0, -18, 0)}
        {line(18, 0, LEAD_LEN, 0)}
        <circle className="sym-line" cx={0} cy={0} r={18} fill="none" />
        {/* Sine wave symbol */}
        <path
          d="M -10 0 Q -5 -8 0 0 Q 5 8 10 0"
          className="sym-line"
          strokeWidth={2}
          fill="none"
        />
        <text className="sym-text" x={-14} y={-10} fontSize="10">~</text>
      </>
    ),
  },
  currentSource: {
    type: 'currentSource',
    prefix: 'I',
    category: 'sources',
    defaultValue: 1,
    unit: 'A',
    w: 88,
    h: 48,
    terminals: [TERMINAL_LEFT, TERMINAL_RIGHT],
    body: (
      <>
        {line(-LEAD_LEN, 0, -18, 0)}
        {line(18, 0, LEAD_LEN, 0)}
        <circle className="sym-line" cx={0} cy={0} r={18} fill="none" />
        {/* Arrow through circle pointing right (terminal 0 -> 1) */}
        <line className="sym-line" x1={-11} y1={0} x2={11} y2={0} strokeWidth={2.2} />
        <polygon points="5,-5 13,0 5,5" className="sym-fill" fill="currentColor" />
      </>
    ),
  },
  acMotor: {
    type: 'acMotor',
    prefix: 'MAC',
    category: 'actuators',
    defaultValue: 15,
    unit: 'Ω',
    w: 100,
    h: 80,
    terminals: [TERMINAL_LEFT, TERMINAL_RIGHT],
    body: (
      <>
        {line(-LEAD_LEN, 0, -20, 0)}
        {line(20, 0, LEAD_LEN, 0)}
        <circle className="sym-line" cx={0} cy={0} r={28} fill="none" />
        <circle className="sym-fill" cx={0} cy={0} r={12} />
        <path
          d="M -8 0 Q -4 -5 0 0 Q 4 5 8 0"
          stroke="#ffffff"
          strokeWidth="2"
          fill="none"
        />
        <text className="sym-text" x={-36} y={30} fontSize="10">
          M~
        </text>
      </>
    ),
  },
};

/**
 * Switch lever is state-dependent, so it is rendered separately from the
 * static body. `closed` comes from component value (1 = closed, 0 = open).
 */
export function switchLever(closed: boolean): ReactNode {
  if (closed) {
    return (
      <g className="switch-lever closed">
        <line
          x1={-24}
          y1={0}
          x2={24}
          y2={0}
          stroke="var(--ok)"
          strokeWidth={2.8}
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 5px var(--ok))' }}
        />
        <circle cx={-24} cy={0} r={4.5} fill="var(--ok)" />
        <circle cx={24} cy={0} r={4.5} fill="var(--ok)" />
        <circle cx={0} cy={0} r={2} fill="#ffffff" />
      </g>
    );
  }
  return (
    <g className="switch-lever open">
      <line
        x1={-24}
        y1={0}
        x2={18}
        y2={-16}
        stroke="var(--sym)"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <circle
        cx={18}
        cy={-16}
        r={3.5}
        fill="var(--canvas-bg)"
        stroke="var(--sym)"
        strokeWidth={1.8}
      />
    </g>
  );
}

export const CATEGORIES: { id: LibraryCategory; labelKey: string }[] = [
  { id: 'passive', labelKey: 'lib.passive' },
  { id: 'sources', labelKey: 'lib.sources' },
  { id: 'switches', labelKey: 'lib.switches' },
  { id: 'actuators', labelKey: 'lib.actuators' },
];
