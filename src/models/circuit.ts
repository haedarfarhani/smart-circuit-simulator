/**
 * Core document model for a circuit.
 * Coordinates are in world units; the grid step is GRID_SIZE.
 */

export const GRID_SIZE = 10;

/**
 * Winding inductance a solenoid gets when the user has not set one. Kept here
 * so the symbol, the tooling and the AC solver all agree on the coil a new
 * solenoid represents.
 */
export const DEFAULT_SOLENOID_INDUCTANCE = 0.05;

export type Rotation = 0 | 90 | 180 | 270;

/** A connection terminal defined in local (unrotated) component space. */
export interface TerminalDef {
  /** local x offset from component origin */
  x: number;
  /** local y offset from component origin */
  y: number;
  /** outward direction along x: -1 | 0 | 1 */
  dx: -1 | 0 | 1;
  /** outward direction along y: -1 | 0 | 1 */
  dy: -1 | 0 | 1;
}

export interface Point {
  x: number;
  y: number;
}

export type LedColor = 'red' | 'green' | 'blue' | 'yellow' | 'purple' | 'white';

/** Every placeable component type. */
export type ComponentType =
  | 'resistor'
  | 'capacitor'
  | 'lamp'
  | 'switch'
  | 'battery'
  | 'ground'
  | 'dcMotor'
  | 'solenoid'
  | 'diode'
  | 'led'
  | 'acVoltageSource'
  | 'currentSource'
  | 'acMotor'
  | 'zenerDiode'
  | 'zener-diode'
  | 'bjtTransistor';

export type ZenerModelType = 'piecewise-linear' | 'advanced' | 'ideal' | 'custom';

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  /** center position in world units */
  x: number;
  y: number;
  rotation: Rotation;
  /** user-visible designator, e.g. "R1" */
  label: string;
  /** electrical value in SI units (Ω, F, V, A, ...) - for Zener, nominal Vz in volts */
  value: number;
  /**
   * Coil inductance in henries. Only present on components that store energy
   * magnetically (the solenoid): its `value` is the winding resistance in Ω,
   * and this is the L used for the stored-energy readout.
   */
  inductance?: number;
  /** Frequency in Hz for AC sources or AC motor */
  frequency?: number;
  /**
   * Phase angle of an AC source, in degrees. v(t) is shifted by
   * this angle: v(t) = Voffset + Vpeak·sin(2πft + φ).
   */
  phaseDeg?: number;
  /** DC offset added to the AC waveform, in volts. */
  offset?: number;
  /** LED emission color */
  color?: LedColor;
  /** Forward voltage drop (V) for Diode, LED, and Zener Diode */
  forwardVoltage?: number;

  /** Zener Diode Parameters */
  zenerVoltage?: number;
  zenerModel?: ZenerModelType;
  /** Nominal test current Izt (A) */
  zenerTestCurrent?: number;
  /** Knee current Izk (A) */
  zenerKneeCurrent?: number;
  /** Dynamic resistance in breakdown rz (Ω) */
  zenerResistance?: number;
  /** Forward dynamic resistance rd_forward (Ω) */
  forwardResistance?: number;
  /** Reverse leakage current Ileak (A) */
  reverseLeakage?: number;
  /** Maximum rated power dissipation (W) */
  ratedPower?: number;
  /** Temperature coefficient alpha in mV/°C */
  tempCoeff?: number;
  /** Ambient temperature (°C) */
  ambientTemp?: number;
  /** Thermal resistance Rth (°C/W) */
  thermalResistance?: number;
  /** Thermal capacitance Cth (J/°C) */
  thermalCapacitance?: number;
  /** Enable dynamic thermal simulation */
  dynamicThermal?: boolean;
  /** Manufacturer part number / preset identifier */
  preset?: string;
  /** BJT transistor type: npn or pnp */
  transistorType?: 'npn' | 'pnp';
  /** BJT model type: simplified, ebers-moll */
  modelType?: 'simplified' | 'ebers-moll';
  /** DC current gain (beta) */
  beta?: number;
  /** Base-emitter forward voltage (V) */
  vbe?: number;
  /** Saturation voltage (V) */
  vceSat?: number;
  /** Leakage current (A) */
  isLeak?: number;
  /** Ebers-Moll saturation current IS */
  is?: number;
  /** Forward emission coefficient NF */
  nf?: number;
  /** Reverse emission coefficient NR */
  nr?: number;
  /** Forward Early voltage VA (V) */
  vaf?: number;
  /** Reverse Early voltage VAR (V) */
  var_?: number;
  /** Ambient temperature (°C) */
  tAmbient?: number;
  /** Max junction temperature (°C) */
  tMax?: number;
  /** Thermal resistance (°C/W) */
  rth?: number;
  /** Thermal capacitance (J/°C) */
  cth?: number;
  /** Max power dissipation (W) */
  pMax?: number;
}

/** A wire endpoint. When `componentId` is null the end is free (disconnected). */
export interface WireEndpoint {
  componentId: string | null;
  terminalIndex: number;
  /** absolute fallback position for free ends (snapped to grid) */
  point: Point | null;
}

export interface Wire {
  id: string;
  start: WireEndpoint;
  end: WireEndpoint;
  /** user-placed intermediate bend points, in order from start to end */
  waypoints: Point[];
}

/**
 * A point where a wire attaches to the middle of another wire. Keeping the
 * point in the target wire's `waypoints` is what makes both wires share one
 * node in `buildTopology` (connectivity is geometric in this model).
 */
export interface WireJunction {
  wireId: string;
  /** grid-aligned point lying exactly on the target wire */
  point: Point;
  /** index in the target wire's waypoints where the point must be inserted */
  insertIndex: number;
}

export interface CircuitDoc {
  components: CircuitComponent[];
  wires: Wire[];
}

export const EMPTY_DOC: CircuitDoc = { components: [], wires: [] };

export function cloneDoc(doc: CircuitDoc): CircuitDoc {
  return {
    components: doc.components.map((c) => ({ ...c })),
    wires: doc.wires.map((w) => ({
      ...w,
      start: { ...w.start },
      end: { ...w.end },
      waypoints: w.waypoints.map((p) => ({ ...p })),
    })),
  };
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

/** Snap a value to the nearest grid multiple. */
export function snap(value: number, step = GRID_SIZE): number {
  return Math.round(value / step) * step;
}

export function snapPoint(p: Point, step = GRID_SIZE): Point {
  return { x: snap(p.x, step), y: snap(p.y, step) };
}
