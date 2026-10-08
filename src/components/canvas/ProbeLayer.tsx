/**
 * On-canvas oscilloscope probe visualization.
 *
 * Renders, for every configured channel:
 *   - the probe markers exactly at the measurement points
 *     (CH+ / CH− for voltage, a directional arrow for
 *     current),
 *   - a draggable label card stating WHAT is measured,
 *   - the locate highlight when the oscilloscope asks for
 *     a channel to be found,
 *   - the in-progress placement preview.
 *
 * Clicking a marker identifies the channel to the
 * oscilloscope (reverse navigation).
 */

import { useRef, useState } from 'react';
import type { CircuitDoc, Point } from '../../models/circuit';
import {
  type CircuitTopology,
  type ComponentSolution,
} from '../../core/solver';
import { terminalWorld } from '../../core/geometry';
import { SYMBOLS } from '../../core/symbols';
import {
  CHANNEL_COLORS,
  type ChannelId,
  type OscilloscopeChannel,
} from '../../models/probe';
import { channelHasMeasurement, useProbeStore } from '../../store/probeStore';
import { useSimulationStore } from '../../store/simulationStore';
import { useUiStore } from '../../store/uiStore';
import { makeT } from '../../i18n';

export type ProbeHoverTarget =
  | { kind: 'node'; nodeId: string; point: Point }
  | { kind: 'branch'; id: string; branchKind: 'component' | 'wire'; point: Point }
  | null;

interface MarkerPos {
  x: number;
  y: number;
}

/** World position of a topology node (its canonical point). */
function nodePosition(
  topology: CircuitTopology | null,
  nodeId: string | null,
  fallback: Point | null,
): MarkerPos | null {
  if (fallback) return fallback;
  const node = topology?.nodes.get(nodeId ?? '');
  if (!node) return null;
  return { x: node.x, y: node.y };
}

/** Midpoint of a wire path (average of its vertices). */
function wireMidpoint(doc: CircuitDoc, wireId: string): MarkerPos | null {
  const wire = doc.wires.find((w) => w.id === wireId);
  if (!wire) return null;
  const pts: Point[] = [];
  if (wire.start.point) pts.push(wire.start.point);
  pts.push(...wire.waypoints);
  if (wire.end.point) pts.push(wire.end.point);
  if (pts.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

/** Center of a component. */
function componentCenter(doc: CircuitDoc, compId: string): MarkerPos | null {
  const comp = doc.components.find((c) => c.id === compId);
  if (!comp) return null;
  return { x: comp.x, y: comp.y };
}

/** Direction of positive current through a branch, in world units. */
function branchDirection(
  doc: CircuitDoc,
  ch: OscilloscopeChannel,
): Point {
  if (ch.branchKind === 'wire') {
    const wire = doc.wires.find((w) => w.id === ch.branchId);
    if (wire) {
      const a = wire.start.point ?? { x: 0, y: 0 };
      const b = wire.end.point ?? { x: 0, y: 0 };
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len > 0) return { x: dx / len, y: dy / len };
    }
    return { x: 1, y: 0 };
  }
  const comp = doc.components.find((c) => c.id === ch.branchId);
  if (comp) {
    // positive current flows terminal 0 → terminal 1
    const t0 = terminalWorld(comp, 0);
    const t1 = terminalWorld(comp, 1);
    const dx = t1.x - t0.x;
    const dy = t1.y - t0.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) return { x: dx / len, y: dy / len };
  }
  return { x: 1, y: 0 };
}

function VoltageMarker({
  ch,
  sign,
  pos,
  located,
  zoom,
  onIdentify,
}: {
  ch: OscilloscopeChannel;
  sign: '+' | '−' | 'gnd';
  pos: MarkerPos;
  located: boolean;
  zoom: number;
  onIdentify: () => void;
}) {
  const color = CHANNEL_COLORS[ch.id];
  const r = 5 / Math.sqrt(zoom);
  return (
    <g
      className={`probe-marker ${located ? 'probe-located' : ''}`}
      data-probe-id={ch.id}
      data-probe-sign={sign}
      transform={`translate(${pos.x},${pos.y})`}
      style={{ cursor: 'pointer', color }}
      onClick={(e) => {
        e.stopPropagation();
        onIdentify();
      }}
    >
      {located && (
        <circle
          className="probe-locate-ring"
          r={r + 5 / zoom}
          fill="none"
          stroke={color}
          strokeWidth={1.5 / zoom}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <circle
        r={r}
        fill={sign === 'gnd' ? '#0b1220' : color}
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <text
        className="probe-marker-text"
        textAnchor="middle"
        dy="0.34em"
        fontSize={9 / Math.sqrt(zoom)}
        fill={sign === 'gnd' ? color : '#06121f'}
        fontWeight="700"
        fontFamily="var(--font-mono)"
      >
        {sign === 'gnd' ? 'GND' : `${ch.id.slice(2)}${sign}`}
      </text>
      {/* leader stub */}
      <line
        x1={0}
        y1={r}
        x2={0}
        y2={r + 10 / zoom}
        stroke={color}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        opacity={0.7}
      />
    </g>
  );
}

function CurrentMarker({
  ch,
  pos,
  dir,
  current,
  located,
  zoom,
  onIdentify,
}: {
  ch: OscilloscopeChannel;
  pos: MarkerPos;
  dir: Point;
  current: number;
  located: boolean;
  zoom: number;
  onIdentify: () => void;
}) {
  const color = CHANNEL_COLORS[ch.id];
  // Arrow points along the actual current direction.
  const angle = Math.atan2(dir.y * Math.sign(current || 1), dir.x * Math.sign(current || 1));
  const len = 16 / Math.sqrt(zoom);
  return (
    <g
      className={`probe-marker ${located ? 'probe-located' : ''}`}
      data-probe-id={ch.id}
      data-probe-sign="I"
      transform={`translate(${pos.x},${pos.y}) rotate(${(angle * 180) / Math.PI})`}
      style={{ cursor: 'pointer', color }}
      onClick={(e) => {
        e.stopPropagation();
        onIdentify();
      }}
    >
      {located && (
        <circle
          className="probe-locate-ring"
          r={len * 0.9}
          fill="none"
          stroke={color}
          strokeWidth={1.5 / zoom}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <line
        x1={-len / 2}
        y1={0}
        x2={len / 2}
        y2={0}
        stroke={color}
        strokeWidth={2.2}
        vectorEffect="non-scaling-stroke"
      />
      <polygon
        points={`${len / 2},0 ${len / 2 - 7 / Math.sqrt(zoom)},${-4.5 / Math.sqrt(zoom)} ${len / 2 - 7 / Math.sqrt(zoom)},${4.5 / Math.sqrt(zoom)}`}
        fill={color}
      />
      <text
        className="probe-marker-text"
        textAnchor="middle"
        dy={-10 / Math.sqrt(zoom)}
        fontSize={9 / Math.sqrt(zoom)}
        fill={color}
        fontWeight="700"
        fontFamily="var(--font-mono)"
      >
        {ch.id}
      </text>
    </g>
  );
}

/** Draggable label card attached to a probe. */
function ProbeLabel({
  ch,
  anchor,
  description,
  value,
  toWorld,
  onDragEnd,
  onIdentify,
}: {
  ch: OscilloscopeChannel;
  anchor: MarkerPos;
  description: string;
  value: string;
  toWorld: (clientX: number, clientY: number) => Point;
  onDragEnd: (offset: Point) => void;
  onIdentify: () => void;
}) {
  const color = CHANNEL_COLORS[ch.id];
  const dragRef = useRef<{ start: Point; offset: Point } | null>(null);
  const [dragging, setDragging] = useState(false);

  const pos = {
    x: anchor.x + ch.labelOffset.x,
    y: anchor.y + ch.labelOffset.y,
  };
  const w = 118;
  const h = 34;

  return (
    <g
      className={`probe-label ${dragging ? 'probe-label-dragging' : ''}`}
      data-probe-id={ch.id}
      transform={`translate(${pos.x},${pos.y})`}
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        dragRef.current = { start: toWorld(e.clientX, e.clientY), offset: { ...ch.labelOffset } };
        setDragging(true);
        try {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {
          // best-effort
        }
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        const world = toWorld(e.clientX, e.clientY);
        onDragEnd({
          x: d.offset.x + (world.x - d.start.x),
          y: d.offset.y + (world.y - d.start.y),
        });
      }}
      onPointerUp={(e) => {
        const wasDragging = dragRef.current;
        dragRef.current = null;
        setDragging(false);
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {
          // best-effort
        }
        if (wasDragging) {
          // a click (no movement) identifies the channel
          const world = toWorld(e.clientX, e.clientY);
          const moved = Math.hypot(
            world.x - (pos.x - ch.labelOffset.x),
            world.y - (pos.y - ch.labelOffset.y),
          );
          if (moved < 4) onIdentify();
        }
      }}
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={5}
        fill="rgba(6, 12, 20, 0.94)"
        stroke={color}
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
        style={{ filter: `drop-shadow(0 2px 5px rgba(0,0,0,0.55))` }}
      />
      <rect x={0} y={0} width={4} height={h} rx={2} fill={color} />
      <text
        x={12}
        y={13}
        fontSize={9.5}
        fontWeight="700"
        fill={color}
        fontFamily="var(--font-mono)"
      >
        {ch.id} · {ch.type === 'voltage' ? 'V' : 'A'}
      </text>
      <text x={12} y={25} fontSize={8.5} fill="var(--text-faint)" fontFamily="var(--font-mono)">
        {description.length > 16 ? `${description.slice(0, 15)}…` : description}
      </text>
      {value && (
        <text
          x={w - 8}
          y={13}
          textAnchor="end"
          fontSize={9}
          fontWeight="600"
          fill="var(--text-strong)"
          fontFamily="var(--font-mono)"
        >
          {value}
        </text>
      )}
    </g>
  );
}

export function ProbeLayer({
  doc,
  topology,
  snapshot,
  zoom,
  toWorld,
  hoverTarget,
}: {
  doc: CircuitDoc;
  topology: import('../../core/solver').CircuitTopology | null;
  snapshot: ReturnType<typeof useSimulationStore.getState>['snapshot'];
  zoom: number;
  toWorld: (clientX: number, clientY: number) => Point;
  hoverTarget: ProbeHoverTarget;
}) {
  const t = makeT(useUiStore((s) => s.locale));
  const channels = useProbeStore((s) => s.channels);
  const placement = useProbeStore((s) => s.placement);
  const locatedChannelId = useProbeStore((s) => s.locatedChannelId);
  const updateChannel = useProbeStore((s) => s.updateChannel);
  const setSelectedChannel = useProbeStore((s) => s.setSelectedChannel);
  const locateChannel = useProbeStore((s) => s.locateChannel);
  const setBottomPanelTab = useUiStore((s) => s.setBottomPanelTab);
  const setBottomPanelOpen = useUiStore((s) => s.setBottomPanelOpen);
  const componentData = snapshot?.componentData ?? new Map<string, ComponentSolution>();
  const wireCurrents = snapshot?.wireCurrents ?? new Map<string, number>();
  const nodeVoltages = snapshot?.nodeVoltages ?? new Map<string, number>();

  const identify = (id: ChannelId) => {
    setSelectedChannel(id);
    locateChannel(id);
    setBottomPanelTab('oscilloscope');
    setBottomPanelOpen(true);
  };

  const nodeLabel = (nodeId: string): string => {
    const n = topology?.nodes.get(nodeId);
    return n ? `(${Math.round(n.x)},${Math.round(n.y)})` : nodeId;
  };

  const describe = (ch: OscilloscopeChannel): string => {
    if (ch.type === 'voltage') {
      const plus = ch.positiveNodeId ? nodeLabel(ch.positiveNodeId) : '?';
      const minus = ch.useGroundRef
        ? 'GND'
        : ch.negativeNodeId
          ? nodeLabel(ch.negativeNodeId)
          : '?';
      return `${plus}→${minus}`;
    }
    if (ch.branchKind === 'wire') return 'wire';
    const comp = doc.components.find((c) => c.id === ch.branchId);
    return comp ? comp.label : '?';
  };

  const liveValue = (ch: OscilloscopeChannel): string => {
    if (!snapshot?.valid) return '';
    if (ch.type === 'voltage') {
      const vPlus = ch.positiveNodeId != null ? (nodeVoltages.get(ch.positiveNodeId) ?? 0) : 0;
      const vMinus = ch.useGroundRef
        ? 0
        : ch.negativeNodeId != null ? (nodeVoltages.get(ch.negativeNodeId) ?? 0) : 0;
      return `${(vPlus - vMinus).toFixed(1)} V`;
    }
    if (ch.branchKind === 'wire') {
      const i = wireCurrents.get(ch.branchId ?? '') ?? 0;
      return `${(i * 1000).toFixed(1)} mA`;
    }
    const i = componentData.get(ch.branchId ?? '')?.current ?? 0;
    return `${(i * 1000).toFixed(1)} mA`;
  };

  return (
    <g className="probe-layer">
      {channels.map((ch) => {
        if (!channelHasMeasurement(ch)) return null;
        const color = CHANNEL_COLORS[ch.id];
        const located = locatedChannelId === ch.id;
        const description = describe(ch);
        const value = liveValue(ch);

        if (ch.type === 'voltage') {
          const plusPos = nodePosition(topology, ch.positiveNodeId, ch.positivePoint);
          const minusPos = ch.useGroundRef
            ? null
            : nodePosition(topology, ch.negativeNodeId, ch.negativePoint);
          // Anchor for the label: the + marker.
          const anchor = plusPos ?? minusPos;
          return (
            <g key={ch.id}>
              {/* connection line between the two measurement points */}
              {plusPos && minusPos && (
                <line
                  className="probe-connection"
                  x1={plusPos.x}
                  y1={plusPos.y}
                  x2={minusPos.x}
                  y2={minusPos.y}
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.55}
                />
              )}
              {plusPos && (
                <VoltageMarker
                  ch={ch}
                  sign="+"
                  pos={plusPos}
                  located={located}
                  zoom={zoom}
                  onIdentify={() => identify(ch.id)}
                />
              )}
              {ch.useGroundRef ? (
                plusPos && (
                  <g
                    className="probe-marker"
                    data-probe-id={ch.id}
                    data-probe-sign="gnd"
                    transform={`translate(${plusPos.x + 14 / Math.sqrt(zoom)},${plusPos.y + 26 / Math.sqrt(zoom)})`}
                  >
                    {/* ground symbol for the reference */}
                    <line x1={0} y1={-8 / zoom} x2={0} y2={0} stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
                    <line x1={-6 / zoom} y1={0} x2={6 / zoom} y2={0} stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
                    <line x1={-4 / zoom} y1={3 / zoom} x2={4 / zoom} y2={3 / zoom} stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                    <line x1={-2 / zoom} y1={6 / zoom} x2={2 / zoom} y2={6 / zoom} stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                  </g>
                )
              ) : (
                minusPos && (
                  <VoltageMarker
                    ch={ch}
                    sign="−"
                    pos={minusPos}
                    located={located}
                    zoom={zoom}
                    onIdentify={() => identify(ch.id)}
                  />
                )
              )}
              {anchor && (
                <ProbeLabel
                  ch={ch}
                  anchor={anchor}
                  description={`${ch.id} ${t('probe.voltage').toLowerCase()} ${description}`}
                  value={value}
                  toWorld={toWorld}
                  onDragEnd={(offset) => updateChannel(ch.id, { labelOffset: offset })}
                  onIdentify={() => identify(ch.id)}
                />
              )}
            </g>
          );
        }

        // Current channel
        const markerPos =
          ch.branchKind === 'wire'
            ? wireMidpoint(doc, ch.branchId ?? '')
            : componentCenter(doc, ch.branchId ?? '');
        const dir = branchDirection(doc, ch);
        const current =
          ch.branchKind === 'wire'
            ? (wireCurrents.get(ch.branchId ?? '') ?? 0)
            : (componentData.get(ch.branchId ?? '')?.current ?? 0);
        return (
          <g key={ch.id}>
            {markerPos && (
              <CurrentMarker
                ch={ch}
                pos={markerPos}
                dir={dir}
                current={current}
                located={located}
                zoom={zoom}
                onIdentify={() => identify(ch.id)}
              />
            )}
            {markerPos && (
              <ProbeLabel
                ch={ch}
                anchor={markerPos}
                description={`${ch.id} ${t('probe.current').toLowerCase()} ${description}`}
                value={value}
                toWorld={toWorld}
                onDragEnd={(offset) => updateChannel(ch.id, { labelOffset: offset })}
                onIdentify={() => identify(ch.id)}
              />
            )}
          </g>
        );
      })}

      {/* ---- placement preview ---- */}
      {placement.mode === 'voltage' && (
        <g className="probe-placement">
          {placement.step === 2 && placement.plusPoint && (
            <circle
              cx={placement.plusPoint.x}
              cy={placement.plusPoint.y}
              r={5 / Math.sqrt(zoom)}
              fill="#38bdf8"
              stroke="#fff"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              opacity={0.9}
            />
          )}
          {hoverTarget?.kind === 'node' && (
            <g transform={`translate(${hoverTarget.point.x},${hoverTarget.point.y})`}>
              <circle
                r={7 / Math.sqrt(zoom)}
                fill="none"
                stroke={placement.step === 1 ? '#38bdf8' : '#f43f5e'}
                strokeWidth={1.6}
                vectorEffect="non-scaling-stroke"
                className="probe-hover-ring"
              />
              <circle r={2.5 / Math.sqrt(zoom)} fill="#fff" />
            </g>
          )}
        </g>
      )}
      {placement.mode === 'current' && hoverTarget?.kind === 'branch' && (
        <g className="probe-placement">
          <circle
            cx={hoverTarget.point.x}
            cy={hoverTarget.point.y}
            r={8 / Math.sqrt(zoom)}
            fill="none"
            stroke="#22c55e"
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
            className="probe-hover-ring"
          />
        </g>
      )}

      {/* located-channel branch glow */}
      {locatedChannelId &&
        channels
          .filter((c) => c.id === locatedChannelId && c.type === 'current' && c.branchKind === 'component')
          .map((ch) => {
            const comp = doc.components.find((c) => c.id === ch.branchId);
            if (!comp) return null;
            const def = SYMBOLS[comp.type];
            const half = Math.max(def.w, def.h) / 2 + 6;
            return (
              <rect
                key={`glow-${ch.id}`}
                className="probe-branch-glow"
                x={comp.x - half}
                y={comp.y - half}
                width={half * 2}
                height={half * 2}
                rx={6}
                fill="none"
                stroke={CHANNEL_COLORS[ch.id]}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
    </g>
  );
}
