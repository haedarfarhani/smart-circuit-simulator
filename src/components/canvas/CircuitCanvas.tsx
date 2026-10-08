import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GRID_SIZE,
  snapPoint,
  type CircuitComponent,
  type ComponentType,
  type Point,
  type WireEndpoint,
  type WireJunction,
} from '../../models/circuit';
import { useCircuitStore } from '../../store/circuitStore';
import {
  clamp,
  MAX_ZOOM,
  MIN_ZOOM,
  useUiStore,
} from '../../store/uiStore';
import { SYMBOLS, switchLever, RESISTOR_BODY } from '../../core/symbols';
import { componentBounds, terminalWorld } from '../../core/geometry';
import { lampBrightness, lampLoad } from '../../core/flow';
import { synchronousSpeedRpm } from '../../core/acSolver';
import { buildWirePath, offsetWire, toSvgPath } from '../../core/wirePath';
import {
  hitTestWires,
  junctionNodes,
  type WireAttachment,
} from '../../core/junctions';
import { setLastPointerWorld } from '../../utils/clipboard';
import { formatValue } from '../../core/labels';
import { makeT } from '../../i18n';
import { type SolverResult } from '../../core/solver';
import { useSimulationStore } from '../../store/simulationStore';
import { CurrentFlowAnimation } from './CurrentFlowAnimation';
import { LampGlowLayer } from './LampGlowLayer';
import { StoredEnergyLayer } from './StoredEnergyLayer';
import { NodePopup, NodeVoltageLayer } from './NodeLayer';
import { findNodeAt, type NodeHit } from '../../core/nodeInfo';
import { MotorRotor } from './MotorRotor';
import { SolenoidPlunger } from './SolenoidPlunger';
import { CanvasHud } from './CanvasHud';
import { ProbeLayer, type ProbeHoverTarget } from './ProbeLayer';
import { useProbeStore } from '../../store/probeStore';

type Mode =
  | { kind: 'idle' }
  | { kind: 'pan'; startX: number; startY: number; panX0: number; panY0: number }
  | { kind: 'move'; origin: Point; ids: string[] }
  | { kind: 'move-wires'; origin: Point; ids: string[] }
  | { kind: 'marquee'; start: Point; additive: boolean };

interface Marquee {
  a: Point;
  b: Point;
}

function mod(v: number, s: number): number {
  return ((v % s) + s) % s;
}

function ComponentView({
  c,
  selected,
  delta,
  zoom,
  hotTerminal,
  solverData,
  simulationEnabled,
}: {
  c: CircuitComponent;
  selected: boolean;
  delta: Point | null;
  zoom: number;
  hotTerminal: [string, number] | null;
  solverData: SolverResult['componentData'] | null;
  simulationEnabled: boolean;
}) {
  const def = SYMBOLS[c.type];
  const x = c.x + (delta?.x ?? 0);
  const y = c.y + (delta?.y ?? 0);
  const halfW = def.w / 2 + 6;
  const halfH = def.h / 2 + 6;

  const compSolution = solverData?.get(c.id);
  // lamps report how hard the filament is burning, so the symbol can glow too
  const lit =
    c.type === 'lamp' && compSolution
      ? lampBrightness(compSolution.power, c.value)
      : 0;
  const lampOverdriven =
    c.type === 'lamp' && compSolution
      ? lampLoad(compSolution.power, c.value) > 1.25
      : false;

  return (
    <g
      className="comp"
      data-comp-id={c.id}
      data-selected={selected}
      data-lit={lit > 0.02}
      data-over={lampOverdriven}
      transform={`translate(${x},${y})`}
    >
      <rect
        className="hit-box"
        x={-halfW}
        y={-halfH}
        width={halfW * 2}
        height={halfH * 2}
        rx={4}
      />
      {/* overlays live inside the rotated group: they are drawn in local
          coordinates exactly like the symbol, so they stay locked to it */}
      <g transform={`rotate(${c.rotation})`}>
        {def.body}

        {/* 1. Switch Active/Closed Indicator */}
        {c.type === 'switch' && switchLever(c.value === 1)}

        {/* 2. Lamp Dynamic Glow & Filament States */}
        {c.type === 'lamp' && (
          <g className="lamp-dynamic-state">
            {lit > 0.01 ? (
              <>
                <circle cx={0} cy={0} r={15} fill={`rgba(251, 191, 36, ${Math.min(0.45, lit * 0.4)})`} />
                <path
                  d="M -11.3 -11.3 L 11.3 11.3 M -11.3 11.3 L 11.3 -11.3"
                  stroke={lit > 0.8 ? '#fffdf0' : '#fbbf24'}
                  strokeWidth={lit > 0.5 ? 2.8 : 2.2}
                  style={{ filter: 'drop-shadow(0 0 5px #fbbf24)' }}
                />
              </>
            ) : (
              <path
                d="M -11.3 -11.3 L 11.3 11.3 M -11.3 11.3 L 11.3 -11.3"
                stroke="var(--text-faint)"
                strokeWidth={1.6}
                opacity={0.4}
              />
            )}
          </g>
        )}

        {/* 3. Battery Active Electric Potential Field */}
        {c.type === 'battery' && simulationEnabled && compSolution && (
          <g className="battery-active-glow">
            <line
              x1={-9}
              y1={-16}
              x2={-9}
              y2={16}
              stroke="#fbbf24"
              strokeWidth={2.8}
              style={{ filter: 'drop-shadow(0 0 5px #fbbf24)' }}
            />
            <line
              x1={9}
              y1={-8}
              x2={9}
              y2={8}
              stroke="#38bdf8"
              strokeWidth={2.6}
              style={{ filter: 'drop-shadow(0 0 4px #38bdf8)' }}
            />
            <rect
              x={-8}
              y={-14}
              width={16}
              height={28}
              fill="rgba(251, 191, 36, 0.12)"
              rx={2}
            />
          </g>
        )}

        {/* 4. Capacitor Electric Field Polarization */}
        {c.type === 'capacitor' && simulationEnabled && compSolution && Math.abs(compSolution.voltage) > 0.1 && (
          <g className="capacitor-active-field">
            <rect
              x={-6}
              y={-13}
              width={12}
              height={26}
              fill="rgba(56, 189, 248, 0.18)"
              rx={1}
            />
            <line
              x1={-7}
              y1={-14}
              x2={-7}
              y2={14}
              stroke="#38bdf8"
              strokeWidth={2.6}
              style={{ filter: 'drop-shadow(0 0 4px #38bdf8)' }}
            />
            <line
              x1={7}
              y1={-14}
              x2={7}
              y2={14}
              stroke="#38bdf8"
              strokeWidth={2.6}
              style={{ filter: 'drop-shadow(0 0 4px #38bdf8)' }}
            />
          </g>
        )}

        {/* 5. Resistor Joule Heating Thermal Glow */}
        {c.type === 'resistor' && simulationEnabled && compSolution && compSolution.power > 0.05 && (
          <polyline
            points={RESISTOR_BODY}
            fill="none"
            stroke="#f43f5e"
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={Math.min(0.85, 0.25 + compSolution.power * 0.4)}
            style={{ filter: 'drop-shadow(0 0 4px #f43f5e)' }}
          />
        )}

        {/* 6. DC Motor Rotor Animation */}
        {c.type === 'dcMotor' &&
          simulationEnabled &&
          compSolution &&
          Math.abs(compSolution.current) > 1e-6 && (
            <MotorRotor
              current={compSolution.current}
              currentDirection={compSolution.currentDirection}
              rpm={compSolution.rpm}
            />
          )}

        {/* 7. AC Motor Synchronous/Induction Rotation */}
        {c.type === 'acMotor' &&
          simulationEnabled &&
          compSolution &&
          Math.abs(compSolution.current) > 1e-6 && (
            <g className="ac-motor-active-animation">
              <circle
                cx={0}
                cy={0}
                r={26}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.8}
                strokeDasharray="6 4"
                style={{
                  animation: 'motorSpin 0.6s linear infinite',
                  filter: 'drop-shadow(0 0 6px var(--accent-glow))',
                }}
              />
              {/* shaft speed comes from the supply frequency, not the current */}
              <MotorRotor
                current={compSolution.current}
                currentDirection={1}
                synchronousRpm={synchronousSpeedRpm(c.frequency ?? 50)}
              />
            </g>
          )}

        {/* 8. Solenoid Dynamic Plunger Animation */}
        {c.type === 'solenoid' &&
          simulationEnabled &&
          compSolution &&
          Math.abs(compSolution.current) > 1e-6 && (
            <SolenoidPlunger current={compSolution.current} />
          )}

        {/* 9. Diode Forward Conduction Indicator */}
        {c.type === 'diode' && simulationEnabled && compSolution && (
          <g className="diode-dynamic-state">
            {compSolution.current > 1e-4 ? (
              // Forward biased - glowing conduction
              <>
                <polygon
                  points="-14,-14 14,0 -14,14"
                  fill="var(--ok)"
                  opacity={0.85}
                  style={{ filter: 'drop-shadow(0 0 6px var(--ok-glow))' }}
                />
                <line
                  x1={14}
                  y1={-14}
                  x2={14}
                  y2={14}
                  stroke="#ffffff"
                  strokeWidth={2.8}
                  style={{ filter: 'drop-shadow(0 0 4px var(--ok))' }}
                />
              </>
            ) : compSolution.voltage < -0.2 ? (
              // Reverse biased - blocking indicator
              <polygon
                points="-14,-14 14,0 -14,14"
                fill="var(--danger)"
                opacity={0.4}
              />
            ) : null}
          </g>
        )}

        {/* 10. Multi-Color LED Emission & Glow */}
        {c.type === 'led' && simulationEnabled && compSolution && (
          <g className="led-dynamic-state">
            {(() => {
              const ledColors: Record<string, { hex: string; glow: string }> = {
                red: { hex: '#ef4444', glow: 'rgba(239, 68, 68, 0.6)' },
                green: { hex: '#22c55e', glow: 'rgba(34, 197, 94, 0.6)' },
                blue: { hex: '#3b82f6', glow: 'rgba(59, 130, 246, 0.6)' },
                yellow: { hex: '#eab308', glow: 'rgba(234, 179, 8, 0.6)' },
                purple: { hex: '#a855f7', glow: 'rgba(168, 85, 247, 0.6)' },
                white: { hex: '#f8fafc', glow: 'rgba(248, 250, 252, 0.7)' },
              };
              const activeColor = ledColors[c.color || 'red'] || ledColors.red;
              // Emission intensity comes from the solved forward current:
              // 0 mA → off, 2 mA → dim, 10 mA → normal, 20 mA → bright.
              const intensity = compSolution.brightness ?? Math.min(1, compSolution.current / 0.02);
              const isEmitting = compSolution.current > 1e-4;
              const overload = compSolution.overload === true;

              if (!isEmitting) return null;

              return (
                <>
                  {/* Radiant light bloom */}
                  <circle
                    cx={4}
                    cy={-4}
                    r={22}
                    fill={activeColor.glow}
                    opacity={(0.15 + intensity * 0.6) * (overload ? 1 : 1)}
                    style={{ filter: `drop-shadow(0 0 10px ${activeColor.hex})` }}
                  />
                  {/* Glowing diode crystal core */}
                  <polygon
                    points="-14,-14 14,0 -14,14"
                    fill={activeColor.hex}
                    opacity={0.35 + intensity * 0.65}
                    style={{ filter: `drop-shadow(0 0 8px ${activeColor.hex})` }}
                  />
                  {/* Photon rays */}
                  <path
                    d="M 0 -15 L 8 -24 M 5 -24 L 8 -24 L 8 -21"
                    stroke={activeColor.hex}
                    strokeWidth={2}
                    opacity={0.4 + intensity * 0.6}
                    style={{ filter: `drop-shadow(0 0 4px ${activeColor.hex})` }}
                  />
                  <path
                    d="M 8 -11 L 16 -20 M 13 -20 L 16 -20 L 16 -17"
                    stroke={activeColor.hex}
                    strokeWidth={2}
                    opacity={0.4 + intensity * 0.6}
                    style={{ filter: `drop-shadow(0 0 4px ${activeColor.hex})` }}
                  />
                  {/* Overload warning ring when driven beyond rated current */}
                  {overload && (
                    <circle
                      r={26}
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth={1.6}
                      strokeDasharray="4 3"
                      opacity={0.8}
                      style={{ filter: 'drop-shadow(0 0 4px #f43f5e)' }}
                    />
                  )}
                </>
              );
            })()}
          </g>
        )}

        {/* 11. AC Voltage Source Oscillation Field */}
        {c.type === 'acVoltageSource' && simulationEnabled && compSolution && (
          <g className="ac-source-active-glow">
            <circle
              cx={0}
              cy={0}
              r={18}
              fill="rgba(56, 189, 248, 0.15)"
              stroke="var(--accent)"
              strokeWidth={2}
              style={{ filter: 'drop-shadow(0 0 6px var(--accent-glow))' }}
            />
            <path
              d="M -10 0 Q -5 -8 0 0 Q 5 8 10 0"
              stroke="#ffffff"
              strokeWidth={2.4}
              fill="none"
              style={{ filter: 'drop-shadow(0 0 4px var(--accent))' }}
            />
          </g>
        )}

        {/* 12. Current Source Active Flow Indicator */}
        {c.type === 'currentSource' && simulationEnabled && compSolution && (
          <g className="current-source-active-glow">
            <circle
              cx={0}
              cy={0}
              r={18}
              fill="rgba(251, 191, 36, 0.12)"
              stroke="var(--warn)"
              strokeWidth={2}
              style={{ filter: 'drop-shadow(0 0 6px var(--warn))' }}
            />
            <line
              x1={-11}
              y1={0}
              x2={11}
              y2={0}
              stroke="#ffffff"
              strokeWidth={2.5}
            />
            <polygon
              points="5,-5 13,0 5,5"
              fill="#ffffff"
              style={{ filter: 'drop-shadow(0 0 4px var(--warn))' }}
            />
          </g>
        )}
      </g>
      <rect
        className="sel-box"
        x={-halfW}
        y={-halfH}
        width={halfW * 2}
        height={halfH * 2}
        rx={4}
      />
      <text className="comp-label" y={halfH + 15}>
        {c.label}
      </text>
      {def.unit !== '' && (
        <text className="comp-label-value" y={halfH + 28}>
          {formatValue(c.value, def.unit)}
        </text>
      )}

      {/* Discrete Telemetry Capsule Pill */}
      {compSolution && simulationEnabled && (selected || Math.abs(compSolution.current) > 1e-5) && c.type !== 'dcMotor' && c.type !== 'solenoid' && (
        <g className="comp-telemetry-badge" transform={`translate(0, ${-halfH - 18})`}>
          <rect
            x={-34}
            y={-7}
            width={68}
            height={15}
            rx={7.5}
            fill="rgba(8, 12, 20, 0.92)"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth={1}
            style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.5))' }}
          />
          <text
            y={3.5}
            textAnchor="middle"
            fill="var(--accent)"
            fontSize={8.5}
            fontFamily="var(--font-mono)"
            fontWeight="650"
          >
            {compSolution.ac ? '~' : ''}
            {compSolution.voltage.toFixed(1)}V · {Math.abs(compSolution.current) < 1 ? `${(Math.abs(compSolution.current) * 1000).toFixed(0)}mA` : `${Math.abs(compSolution.current).toFixed(2)}A`}
          </text>
        </g>
      )}
      {def.terminals.map((_, i) => {
        const t = terminalWorld(c, i);
        const lx = t.x - c.x;
        const ly = t.y - c.y;
        const hot =
          hotTerminal !== null &&
          hotTerminal[0] === c.id &&
          hotTerminal[1] === i;
        return (
          <g key={i}>
            <circle
              className="terminal"
              data-hot={hot}
              cx={lx}
              cy={ly}
              r={4 / zoom}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              className="terminal-hit"
              data-terminal={`${c.id}:${i}`}
              cx={lx}
              cy={ly}
              r={10 / zoom}
            />
          </g>
        );
      })}
    </g>
  );
}

export function CircuitCanvas() {
  const t = makeT(useUiStore((s) => s.locale));
  const svgRef = useRef<SVGSVGElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const modeRef = useRef<Mode>({ kind: 'idle' });
  const initializedRef = useRef(false);

  const doc = useCircuitStore((s) => s.doc);
  const tool = useUiStore((s) => s.tool);
  const selection = useUiStore((s) => s.selection);
  const zoom = useUiStore((s) => s.zoom);
  const panX = useUiStore((s) => s.panX);
  const panY = useUiStore((s) => s.panY);
  const gridVisible = useUiStore((s) => s.gridVisible);
  const spaceHeld = useUiStore((s) => s.spaceHeld);
  const draft = useUiStore((s) => s.wireDraft);
  const simulationEnabled = useUiStore((s) => s.simulationEnabled);
  const simulationSpeed = useUiStore((s) => s.simulationSpeed);

  const [dragDelta, setDragDelta] = useState<Point | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [hoverWireId, setHoverWireId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NodeHit | null>(null);
  /** press position of an in-progress wiring gesture (enables drag-to-connect) */
  const wireGestureRef = useRef<{
    x: number;
    y: number;
    dragged: boolean;
  } | null>(null);
  const snapshot = useSimulationStore((s) => s.snapshot);
  const topology = useSimulationStore((s) => s.topology);
  const wireCurrents = snapshot?.wireCurrents ?? new Map();
  const componentData = snapshot?.componentData ?? new Map();
  const simValid = snapshot?.valid ?? false;
  const simError = snapshot?.error ?? null;
  const junctions = useMemo(() => junctionNodes(doc), [doc]);

  // ---- oscilloscope probe placement ----
  const probeStore = useProbeStore;
  const [probeHover, setProbeHover] = useState<ProbeHoverTarget>(null);

  /* ---------- helpers ---------- */

  const capture = (pointerId: number) => {
    try {
      svgRef.current?.setPointerCapture(pointerId);
    } catch {
      // capture is best-effort (synthetic events / touch)
    }
  };

  const toWorld = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const ui = useUiStore.getState();
    return {
      x: (clientX - r.left - ui.panX) / ui.zoom,
      y: (clientY - r.top - ui.panY) / ui.zoom,
    };
  };

  const findTerminal = (world: Point): [string, number] | null => {
    const ui = useUiStore.getState();
    const threshold = 11 / ui.zoom;
    let best: [string, number] | null = null;
    let bestDist = threshold;
    for (const c of doc.components) {
      const def = SYMBOLS[c.type];
      for (let i = 0; i < def.terminals.length; i++) {
        const tp = terminalWorld(c, i);
        const d = Math.hypot(tp.x - world.x, tp.y - world.y);
        if (d <= bestDist) {
          bestDist = d;
          best = [c.id, i];
        }
      }
    }
    return best;
  };

  /** Nearest wire within grabbing distance of the cursor, if any. */
  const wireAttachmentAt = (world: Point): WireAttachment | null => {
    const ui = useUiStore.getState();
    return hitTestWires(useCircuitStore.getState().doc, world, 10 / ui.zoom);
  };

  const toJunction = (att: WireAttachment): WireJunction | null =>
    att.insertIndex === null
      ? null
      : { wireId: att.wireId, point: att.point, insertIndex: att.insertIndex };

  const freeEnd = (p: Point): WireEndpoint => ({
    componentId: null,
    terminalIndex: 0,
    point: p,
  });

  /**
   * Finish a draft: create the wire and apply any junctions it attached to in
   * one undo step.
   */
  const completeWire = (
    draft: { start: WireEndpoint; waypoints: Point[]; startJunction: WireJunction | null },
    end: WireEndpoint,
    endJunction: WireJunction | null,
    statusKey: string = 'status.ready',
  ) => {
    const ui = useUiStore.getState();
    const junctions: WireJunction[] = [];
    if (draft.startJunction) junctions.push(draft.startJunction);
    if (endJunction) junctions.push(endJunction);
    const wireId = useCircuitStore
      .getState()
      .addWire(draft.start, end, draft.waypoints, junctions);
    ui.setWireDraft(null);
    ui.select([wireId]);
    ui.setStatus(statusKey);
  };

  /** Resolve what the wire should connect to at a world point. */
  const resolveTarget = (
    world: Point,
  ):
    | { kind: 'terminal'; id: string; index: number }
    | { kind: 'wire'; attachment: WireAttachment }
    | { kind: 'free' } => {
    const term = findTerminal(world);
    if (term) return { kind: 'terminal', id: term[0], index: term[1] };
    const att = wireAttachmentAt(world);
    if (att) return { kind: 'wire', attachment: att };
    return { kind: 'free' };
  };

  /**
   * What a probe placement gesture would attach to at this
   * point: a node (voltage probes) or a branch — a component
   * or a wire (current probes).
   */
  const probeTargetAt = (
    world: Point,
    target: Element | null,
  ): ProbeHoverTarget => {
    const placement = probeStore.getState().placement;
    if (placement.mode === 'voltage') {
      if (!topology) return null;
      const node = findNodeAt(topology, world, 14 / useUiStore.getState().zoom);
      return node
        ? { kind: 'node', nodeId: node.nodeId, point: node.point }
        : null;
    }
    if (placement.mode === 'current') {
      const compEl =
        target instanceof Element ? target.closest('[data-comp-id]') : null;
      if (compEl) {
        const id = compEl.getAttribute('data-comp-id')!;
        const comp = doc.components.find((c) => c.id === id);
        if (comp)
          return { kind: 'branch', id, branchKind: 'component', point: { x: comp.x, y: comp.y } };
      }
      const wireEl =
        target instanceof Element ? target.closest('[data-wire-id]') : null;
      if (wireEl) {
        const id = wireEl.getAttribute('data-wire-id')!;
        const wire = doc.wires.find((w) => w.id === id);
        if (wire) {
          const pts: Point[] = [];
          if (wire.start.point) pts.push(wire.start.point);
          pts.push(...wire.waypoints);
          if (wire.end.point) pts.push(wire.end.point);
          const mid = pts[Math.floor(pts.length / 2)] ?? null;
          if (mid) return { kind: 'branch', id, branchKind: 'wire', point: mid };
        }
      }
      // geometric fallbacks (hit the body of a wire / a terminal)
      const term = findTerminal(world);
      if (term) {
        const comp = doc.components.find((c) => c.id === term[0]);
        if (comp)
          return { kind: 'branch', id: term[0], branchKind: 'component', point: { x: comp.x, y: comp.y } };
      }
      const att = wireAttachmentAt(world);
      if (att)
        return { kind: 'branch', id: att.wireId, branchKind: 'wire', point: att.point };
    }
    return null;
  };

  /* ---------- wire draft path ---------- */

  const draftPath = useMemo(() => {
    if (!draft) return null;
    let end: WireEndpoint;
    if (draft.hoverTerminal) {
      end = {
        componentId: draft.hoverTerminal[0],
        terminalIndex: draft.hoverTerminal[1],
        point: null,
      };
    } else if (draft.cursor) {
      end = { componentId: null, terminalIndex: 0, point: draft.cursor };
    } else {
      return null;
    }
    return buildWirePath(doc, {
      id: '__draft__',
      start: draft.start,
      end,
      waypoints: draft.waypoints,
    });
  }, [draft, doc]);

  /* ---------- pointer interactions ---------- */

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const ui = useUiStore.getState();
    const world = toWorld(e.clientX, e.clientY);
    const target = e.target as Element;

    // Pan: middle mouse, or Space + any button
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      modeRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        panX0: ui.panX,
        panY0: ui.panY,
      };
      setIsPanning(true);
      capture(e.pointerId);
      return;
    }

    // Right click cancels an in-progress wire or probe placement
    if (e.button === 2) {
      if (draft) ui.setWireDraft(null);
      if (probeStore.getState().placement.mode !== 'idle') {
        probeStore.getState().cancelPlacement();
      }
      return;
    }
    if (e.button !== 0) return;

    // --- Oscilloscope probe placement owns the canvas ---
    const placement = probeStore.getState().placement;
    if (placement.mode !== 'idle') {
      const hit = probeTargetAt(world, target);
      if (placement.mode === 'voltage' && hit?.kind === 'node') {
        if (placement.step === 1) {
          probeStore.getState().setVoltageFirstPoint(hit.nodeId, hit.point);
        } else {
          probeStore.getState().setVoltageSecondPoint(hit.nodeId, hit.point);
        }
      } else if (placement.mode === 'current' && hit?.kind === 'branch') {
        const label =
          hit.branchKind === 'component'
            ? (doc.components.find((c) => c.id === hit.id)?.label ?? '')
            : 'wire';
        probeStore.getState().setCurrentBranch(hit.id, hit.branchKind, hit.point, label);
      }
      setProbeHover(null);
      return;
    }

    // Clicking an existing probe marker identifies its channel
    // (reverse navigation: circuit → oscilloscope).
    const probeEl = target instanceof Element ? target.closest('[data-probe-id]') : null;
    if (probeEl) return;

    // --- Wiring: finish on a terminal / on a wire, or add a bend point ---
    if (draft) {
      const hit = resolveTarget(world);
      if (hit.kind === 'terminal') {
        const isSame =
          draft.start.componentId === hit.id &&
          draft.start.terminalIndex === hit.index;
        if (isSame) {
          ui.setWireDraft(null);
          return;
        }
        completeWire(
          draft,
          { componentId: hit.id, terminalIndex: hit.index, point: null },
          null,
        );
      } else if (hit.kind === 'wire') {
        // Attach to the body of an existing wire: the junction point is added
        // to that wire, which makes both wires share one node.
        completeWire(
          draft,
          freeEnd(hit.attachment.point),
          toJunction(hit.attachment),
          'status.wireJunction',
        );
      } else {
        const p = snapPoint(world);
        ui.setWireDraft({
          ...draft,
          waypoints: [...draft.waypoints, p],
          cursor: world,
          hoverTerminal: null,
        });
      }
      return;
    }

    // --- Start a wire (wire tool) ---
    if (tool === 'wire') {
      capture(e.pointerId);
      wireGestureRef.current = { x: e.clientX, y: e.clientY, dragged: false };
      const hit = resolveTarget(world);
      const base = {
        waypoints: [] as Point[],
        cursor: world,
        hoverTerminal: null,
      };
      if (hit.kind === 'terminal') {
        ui.setWireDraft({
          ...base,
          start: { componentId: hit.id, terminalIndex: hit.index, point: null },
          startJunction: null,
        });
      } else if (hit.kind === 'wire') {
        ui.setWireDraft({
          ...base,
          start: freeEnd(hit.attachment.point),
          startJunction: toJunction(hit.attachment),
        });
      } else {
        ui.setWireDraft({
          ...base,
          start: freeEnd(snapPoint(world)),
          startJunction: null,
        });
      }
      ui.setStatus('status.wireStart');
      return;
    }

    // --- Select tool ---
    const compEl = target.closest('[data-comp-id]');
    const wireEl = target.closest('[data-wire-id]');

    if (compEl) {
      const id = compEl.getAttribute('data-comp-id')!;
      let ids = selection;
      if (e.shiftKey) {
        ui.toggleSelect(id);
        ids = selection.includes(id)
          ? selection.filter((x) => x !== id)
          : [...selection, id];
      } else if (!selection.includes(id)) {
        ui.select([id]);
        ids = [id];
      }
      if (ids.includes(id)) {
        modeRef.current = { kind: 'move', origin: world, ids };
        setDragDelta({ x: 0, y: 0 });
        capture(e.pointerId);
      }
      return;
    }

    if (wireEl) {
      const id = wireEl.getAttribute('data-wire-id')!;
      let ids: string[];
      if (e.shiftKey) {
        ui.toggleSelect(id);
        ids = selection.includes(id)
          ? selection.filter((x) => x !== id)
          : [...selection, id];
      } else if (!selection.includes(id)) {
        ui.select([id]);
        ids = [id];
      } else {
        ids = selection;
      }
      // only wires take part in a wire drag: components have their own mode
      const wireIds = ids.filter((x) =>
        useCircuitStore.getState().doc.wires.some((w) => w.id === x),
      );
      if (wireIds.includes(id)) {
        modeRef.current = { kind: 'move-wires', origin: world, ids: wireIds };
        setDragDelta({ x: 0, y: 0 });
        capture(e.pointerId);
      }
      return;
    }

    // Empty canvas → rubber-band selection
    if (!e.shiftKey) ui.clearSelection();
    modeRef.current = { kind: 'marquee', start: world, additive: e.shiftKey };
    setMarquee({ a: world, b: world });
    capture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const world = toWorld(e.clientX, e.clientY);
    setLastPointerWorld(world);
    if (cursorRef.current) {
      cursorRef.current.textContent = `${Math.round(world.x)}, ${Math.round(world.y)}`;
    }

    const mode = modeRef.current;
    const ui = useUiStore.getState();

    // An in-progress wiring gesture becomes a drag once it travels far enough;
    // releasing then completes the wire (drag-to-connect).
    const gesture = wireGestureRef.current;
    if (gesture && !gesture.dragged) {
      if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 4) {
        gesture.dragged = true;
      }
    }

    if (mode.kind === 'pan') {
      ui.setView({
        panX: mode.panX0 + (e.clientX - mode.startX),
        panY: mode.panY0 + (e.clientY - mode.startY),
      });
      return;
    }

    if (mode.kind === 'move' || mode.kind === 'move-wires') {
      const raw = { x: world.x - mode.origin.x, y: world.y - mode.origin.y };
      setDragDelta(ui.snapEnabled ? snapPoint(raw) : raw);
      return;
    }

    if (mode.kind === 'marquee') {
      setMarquee({ a: mode.start, b: world });
      return;
    }

    // Hover feedback while wiring (or while the wire tool is active)
    if (draft) {
      const hover = findTerminal(world);
      ui.setWireDraft({ ...draft, cursor: world, hoverTerminal: hover });
      setHoverWireId(
        hover ? null : wireAttachmentAt(world)?.wireId ?? null,
      );
    } else if (hoverWireId !== null) {
      setHoverWireId(null);
    }

    // Probe placement hover highlight
    if (probeStore.getState().placement.mode !== 'idle') {
      setProbeHover(probeTargetAt(world, e.target as Element | null));
    } else if (probeHover !== null) {
      setProbeHover(null);
    }

    // Node hover card: only when nothing else is being dragged or drawn, so it
    // never competes with terminals, wires or components for clicks.
    if (!draft && tool === 'select' && topology && simValid) {
      const node = findNodeAt(topology, world, 16 / ui.zoom);
      setHoveredNode((prev) => {
        if (!node) return prev === null ? prev : null;
        if (prev && prev.nodeId === node.nodeId) return prev;
        return node;
      });
    } else if (hoveredNode !== null) {
      setHoveredNode(null);
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const mode = modeRef.current;
    const ui = useUiStore.getState();
    const store = useCircuitStore.getState();

    // Drag-to-connect: a wiring gesture that moved completes on release.
    const gesture = wireGestureRef.current;
    wireGestureRef.current = null;
    if (gesture?.dragged && ui.wireDraft) {
      const dragDraft = ui.wireDraft;
      const world = toWorld(e.clientX, e.clientY);
      const hit = resolveTarget(world);
      if (hit.kind === 'terminal') {
        const isSame =
          dragDraft.start.componentId === hit.id &&
          dragDraft.start.terminalIndex === hit.index;
        if (isSame) ui.setWireDraft(null);
        else
          completeWire(
            dragDraft,
            { componentId: hit.id, terminalIndex: hit.index, point: null },
            null,
          );
      } else if (hit.kind === 'wire') {
        completeWire(
          dragDraft,
          freeEnd(hit.attachment.point),
          toJunction(hit.attachment),
          'status.wireJunction',
        );
      } else {
        completeWire(dragDraft, freeEnd(snapPoint(world)), null);
      }
      setHoverWireId(null);
      modeRef.current = { kind: 'idle' };
      setDragDelta(null);
      setMarquee(null);
      setIsPanning(false);
      try {
        svgRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // pointer may already be released
      }
      return;
    }

    if (mode.kind === 'move') {
      if (dragDelta && (dragDelta.x !== 0 || dragDelta.y !== 0)) {
        store.moveComponents(mode.ids, dragDelta.x, dragDelta.y);
      }
    } else if (mode.kind === 'move-wires') {
      if (dragDelta && (dragDelta.x !== 0 || dragDelta.y !== 0)) {
        store.moveWires(mode.ids, dragDelta.x, dragDelta.y);
      }
    } else if (mode.kind === 'marquee' && marquee) {
      const x0 = Math.min(marquee.a.x, marquee.b.x);
      const x1 = Math.max(marquee.a.x, marquee.b.x);
      const y0 = Math.min(marquee.a.y, marquee.b.y);
      const y1 = Math.max(marquee.a.y, marquee.b.y);
      const hits: string[] = [];
      for (const c of store.doc.components) {
        const b = componentBounds(c);
        if (b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0) {
          hits.push(c.id);
        }
      }
      if (mode.additive) {
        ui.select([...new Set([...ui.selection, ...hits])]);
      } else {
        ui.select(hits);
      }
    }

    modeRef.current = { kind: 'idle' };
    setDragDelta(null);
    setMarquee(null);
    setIsPanning(false);
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // pointer may already be released
    }
  };

  /* ---------- wheel zoom (native, non-passive) ---------- */

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ui = useUiStore.getState();
      const r = svg.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * 0.0016);
      const nz = clamp(ui.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const wx = (sx - ui.panX) / ui.zoom;
      const wy = (sy - ui.panY) / ui.zoom;
      ui.setView({ zoom: nz, panX: sx - wx * nz, panY: sy - wy * nz });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  /* ---------- escape cancels probe placement ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const st = useProbeStore.getState();
        if (st.placement.mode !== 'idle') st.cancelPlacement();
        if (st.locatedChannelId) st.locateChannel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- circuit solver handled by simulationStore ---------- */

  /* ---------- center the view on first mount ---------- */

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const ui = useUiStore.getState();
    if (ui.panX === 0 && ui.panY === 0) {
      ui.setView({ panX: r.width / 2, panY: r.height / 2 });
    }
  }, []);

  /* ---------- drag & drop from the library ---------- */

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-circuit-type')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData(
      'application/x-circuit-type',
    ) as ComponentType;
    if (!type || !SYMBOLS[type]) return;
    e.preventDefault();
    const world = toWorld(e.clientX, e.clientY);
    const store = useCircuitStore.getState();
    const ui = useUiStore.getState();
    const id = store.addComponent(type, world.x, world.y);
    if (id) {
      ui.select([id]);
      ui.setStatus('status.placed');
    }
  };

  /* ---------- rendering ---------- */

  const step = GRID_SIZE * zoom;
  const minorStep = step >= 7 ? step : step * 5 >= 7 ? step * 5 : 0;
  const majorStep = minorStep > 0 && minorStep * 5 >= 40 ? minorStep * 5 : 0;
  const showGrid = gridVisible && minorStep > 0;

  const marqueeRect = marquee
    ? {
        x: Math.min(marquee.a.x, marquee.b.x),
        y: Math.min(marquee.a.y, marquee.b.y),
        w: Math.abs(marquee.b.x - marquee.a.x),
        h: Math.abs(marquee.b.y - marquee.a.y),
      }
    : null;

  const isEmpty = doc.components.length === 0 && doc.wires.length === 0;

  const simSummary = useMemo(() => {
    if (!simValid || !simulationEnabled) return null;

    const battery = doc.components.find((c) => c.type === 'battery' || c.type === 'acVoltageSource');
    const sol = battery ? componentData.get(battery.id) : null;
    if (!sol) return null;

    let totalLoadPower = 0;
    let totalPower = 0;
    const loads: { label: string; voltage: number; current: number; power: number; type: string }[] = [];

    for (const comp of doc.components) {
      const cs = componentData.get(comp.id);
      if (!cs) continue;
      if (comp.type === 'battery' || comp.type === 'acVoltageSource') {
        totalPower = Math.abs(cs.power);
      } else {
        totalLoadPower += Math.abs(cs.power);
        loads.push({
          label: comp.label,
          voltage: cs.voltage,
          current: cs.current,
          power: cs.power,
          type: comp.type,
        });
      }
    }

    const efficiency = totalPower > 0.001 ? (totalLoadPower / totalPower) * 100 : 0;

    return {
      voltage: Math.abs(sol.voltage),
      current: Math.abs(sol.current),
      power: totalPower,
      loadPower: totalLoadPower,
      efficiency,
      loads,
    };
  }, [componentData, simValid, simulationEnabled, doc]);

  return (
    <div className="canvas-wrap">
      <svg
        ref={svgRef}
        className="canvas-svg"
        data-tool={tool}
        data-panning={isPanning || spaceHeld}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label={t('app.title')}
      >
        <defs>
          {minorStep > 0 && (
            <pattern
              id="grid-minor"
              width={minorStep}
              height={minorStep}
              patternUnits="userSpaceOnUse"
              patternTransform={`translate(${mod(panX, minorStep)},${mod(
                panY,
                minorStep,
              )})`}
            >
              <path
                d={`M ${minorStep} 0 L 0 0 0 ${minorStep}`}
                fill="none"
                stroke="var(--grid-line)"
                strokeWidth="1"
              />
            </pattern>
          )}
          {majorStep > 0 && (
            <pattern
              id="grid-major"
              width={majorStep}
              height={majorStep}
              patternUnits="userSpaceOnUse"
              patternTransform={`translate(${mod(panX, majorStep)},${mod(
                panY,
                majorStep,
              )})`}
            >
              <path
                d={`M ${majorStep} 0 L 0 0 0 ${majorStep}`}
                fill="none"
                stroke="var(--grid-line-strong)"
                strokeWidth="1"
              />
            </pattern>
          )}
        </defs>

        {showGrid && (
          <>
            <rect width="100%" height="100%" fill="url(#grid-minor)" />
            {majorStep > 0 && (
              <rect width="100%" height="100%" fill="url(#grid-major)" />
            )}
          </>
        )}

        <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
          {/* wires */}
          {doc.wires.map((w) => {
            const mode = modeRef.current;
            const dragWire =
              dragDelta &&
              mode.kind === 'move-wires' &&
              mode.ids.includes(w.id);
            const target = dragWire
              ? offsetWire(doc, w, dragDelta.x, dragDelta.y)
              : w;
            const pts = buildWirePath(doc, target);
            if (!pts || pts.length < 2) return null;
            const d = toSvgPath(pts, true);
            const selected = selection.includes(w.id);
            const current = wireCurrents.get(w.id) ?? 0;
            const hasCurrent = Math.abs(current) > 1e-6;
            return (
              <g
                key={w.id}
                className="wire"
                data-wire-id={w.id}
                data-selected={selected}
                data-hot={hoverWireId === w.id}
              >
                <path className="wire-halo" d={d} />
                <path className="wire-hit" d={d} />
                <path
                  className="wire-line"
                  d={d}
                  style={
                    hasCurrent
                      ? {
                          stroke: current > 0 ? 'var(--current-flow-pos)' : 'var(--current-flow-neg)',
                          strokeWidth: 2.8,
                          filter: 'drop-shadow(0 0 3px currentColor)',
                        }
                      : undefined
                  }
                />
                {[w.start, w.end].map((end, i) => {
                  if (end.componentId) return null;
                  const p = end.point;
                  if (!p) return null;
                  return (
                    <circle
                      key={i}
                      className="wire-endpoint"
                      cx={p.x}
                      cy={p.y}
                      r={3.5 / zoom}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </g>
            );
          })}

          {/* junctions: points where three or more conductors meet */}
          {junctions.map((p) => (
            <circle
              key={`${p.x},${p.y}`}
              className="wire-junction"
              cx={p.x}
              cy={p.y}
              r={4 / zoom}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* light from the lamps (animated) */}
          {simulationEnabled && (
            <LampGlowLayer
              doc={doc}
              enabled={simulationEnabled}
            />
          )}

          {/* stored energy of capacitors and coils (animated) */}
          {simulationEnabled && (
            <StoredEnergyLayer
              doc={doc}
              enabled={simulationEnabled}
            />
          )}

          {/* node voltages */}
          {simulationEnabled && (
            <NodeVoltageLayer
              topology={topology}
              solverResult={snapshot}
              hoveredNodeId={hoveredNode?.nodeId ?? null}
            />
          )}

          {/* current flow animation layer */}
          {simulationEnabled && (
            <CurrentFlowAnimation
              doc={doc}
              wireCurrents={wireCurrents}
              simulationSpeed={simulationSpeed}
              enabled={simulationEnabled}
              zoom={zoom}
            />
          )}

          {/* oscilloscope probes: markers, labels, placement */}
          <ProbeLayer
            doc={doc}
            topology={topology}
            snapshot={snapshot}
            zoom={zoom}
            toWorld={toWorld}
            hoverTarget={probeHover}
          />

          {/* components */}
          {doc.components.map((c) => (
            <ComponentView
              key={c.id}
              c={c}
              selected={selection.includes(c.id)}
              delta={
                dragDelta &&
                modeRef.current.kind === 'move' &&
                modeRef.current.ids.includes(c.id)
                  ? dragDelta
                  : null
              }
              zoom={zoom}
              hotTerminal={draft?.hoverTerminal ?? null}
              solverData={componentData}
              simulationEnabled={simulationEnabled}
            />
          ))}

          {/* wire draft preview */}
          {draft && draftPath && (
            <path className="draft-line" d={toSvgPath(draftPath)} />
          )}

          {/* marquee */}
          {marqueeRect && (
            <rect
              className="marquee"
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.w}
              height={marqueeRect.h}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>
      </svg>

      {isEmpty && !draft && (
        <div className="canvas-empty">
          <div className="big">
            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3 12h4l2-5 3 10 2.5-7 1.5 2h5"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t('inspector.help1')}
          </div>
          <div className="small">{t('inspector.help2')}</div>
          <div className="small">{t('tool.wire.hint')}</div>
        </div>
      )}

      {simulationEnabled && hoveredNode && !draft && (
        <NodePopup
          doc={doc}
          topology={topology}
          solverResult={snapshot}
          hit={hoveredNode}
          zoom={zoom}
          panX={panX}
          panY={panY}
        />
      )}

      <CanvasHud />

      <span
        className="cursor-chip"
        ref={cursorRef}
        aria-hidden="true"
      >
        0, 0
      </span>

      {simulationEnabled && simSummary && (
        <div className="sim-summary" aria-label={t('sim.summary')}>
          <div className="sim-summary-title">{t('sim.summary')}</div>
          <div className="sim-summary-row">
            <span>{t('sim.summaryVoltage')}</span>
            <b>{simSummary.voltage.toFixed(2)} V</b>
          </div>
          <div className="sim-summary-row">
            <span>{t('sim.summaryCurrent')}</span>
            <b>{simSummary.current.toFixed(3)} A</b>
          </div>
          <div className="sim-summary-row">
            <span>{t('sim.summaryPower')}</span>
            <b>{simSummary.power.toFixed(3)} W</b>
          </div>
          {simSummary.loads.length > 1 && (
            <div className="sim-summary-row">
              <span>{t('sim.summaryEfficiency')}</span>
              <b>{simSummary.efficiency.toFixed(1)}%</b>
            </div>
          )}
          <div className="sim-summary-loads">
            {simSummary.loads.map((load) => (
              <div
                key={load.label}
                className="sim-load-row"
                title={load.type}
              >
                <span className="sim-load-name">{load.label}</span>
                <span className="sim-load-values">
                  {load.voltage.toFixed(2)}V · {Math.abs(load.current).toFixed(3)}A · {load.power.toFixed(3)}W
                </span>
              </div>
            ))}
          </div>
          {simError && (
            <div className="sim-error">{t('sim.noSolution')}: {simError}</div>
          )}
        </div>
      )}
    </div>
  );
}
