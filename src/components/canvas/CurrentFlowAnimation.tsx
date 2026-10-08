import { useEffect, useMemo, useRef, useState } from 'react';
import { buildWirePath, toSvgPath } from '../../core/wirePath';
import { flowSpeed, pulsePattern, pulseStrength } from '../../core/flow';
import type { CircuitDoc, Point } from '../../models/circuit';
import { useUiStore } from '../../store/uiStore';

interface WirePath {
  wireId: string;
  points: Point[];
  pathData: string;
  current: number;
}

interface AnimatedWire {
  wireId: string;
  pathData: string;
  /** dash pattern phase, in world units */
  phase: number;
  /** world units per second, signed */
  speed: number;
  /** 0..1 — how hard this conductor is driven, drives pulse size and glow */
  strength: number;
  current: number;
  color: string;
}

const COLOR_POS = 'var(--current-flow-pos)';
const COLOR_NEG = 'var(--current-flow-neg)';

/**
 * Moving charge on the wires. Each pulse is drawn as three stacked dashes that
 * share one phase: a wide, soft trail, a solid core and a small bright head at
 * the leading edge, so a pulse looks like a comet and its direction is obvious
 * at a glance. Pulse size and glow follow the calculated current, and the
 * speed follows it too, so a branch with more resistance drifts slower.
 */
export function CurrentFlowAnimation({
  doc,
  wireCurrents,
  simulationSpeed = 1,
  enabled = true,
  zoom = 1,
}: {
  doc: CircuitDoc;
  wireCurrents: Map<string, number>;
  simulationSpeed?: number;
  enabled?: boolean;
  zoom?: number;
}) {
  const [animatedWires, setAnimatedWires] = useState<AnimatedWire[]>([]);
  const animationRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const currentDirection = useUiStore((s) => s.currentDirection);

  const wirePaths = useMemo(() => {
    const paths: WirePath[] = [];
    for (const wire of doc.wires) {
      const pts = buildWirePath(doc, wire);
      if (pts && pts.length >= 2) {
        paths.push({
          wireId: wire.id,
          points: pts,
          pathData: toSvgPath(pts),
          current: wireCurrents.get(wire.id) ?? 0,
        });
      }
    }
    return paths;
  }, [doc.wires, wireCurrents]);

  useEffect(() => {
    if (!enabled) {
      setAnimatedWires([]);
      return;
    }

    const wires: AnimatedWire[] = [];
    for (const wp of wirePaths) {
      const current = wp.current;
      if (Math.abs(current) < 1e-6) continue;

      let direction = current >= 0 ? 1 : -1;
      if (currentDirection === 'electron') direction *= -1;

      wires.push({
        wireId: wp.wireId,
        pathData: wp.pathData,
        phase: 0,
        speed: flowSpeed(current, simulationSpeed) * direction,
        strength: pulseStrength(current),
        current,
        color: current > 0 ? COLOR_POS : COLOR_NEG,
      });
    }
    setAnimatedWires(wires);
  }, [wirePaths, wireCurrents, simulationSpeed, enabled, currentDirection]);

  useEffect(() => {
    if (!enabled || animatedWires.length === 0) return;

    const animate = (time: number) => {
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = time;

      // The phase just accumulates; it is taken modulo the dash period at
      // render time, where the period is known (it follows the zoom level).
      setAnimatedWires((prev) =>
        prev.map((w) =>
          dt <= 0 ? w : { ...w, phase: w.phase + w.speed * dt },
        ),
      );

      animationRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [enabled, animatedWires.length]);

  const wireElements = useMemo(
    () =>
      animatedWires.map((w) => {
        const p = pulsePattern(w.current, w.phase, zoom);
        const blur = 1.6 + 1.6 * w.strength;
        return (
          <g key={w.wireId} className="current-flow-wire">
            <path
              className="current-flow-trail"
              d={w.pathData}
              stroke={w.color}
              strokeWidth={p.trailWidth}
              strokeDasharray={`${p.trailLen} ${Math.max(
                p.period - p.trailLen,
                0.5 / Math.max(zoom, 0.01),
              )}`}
              strokeDashoffset={p.trailOffset}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={p.trailOpacity}
              filter={`blur(${blur.toFixed(2)}px)`}
            />
            <path
              className="current-flow-main"
              d={w.pathData}
              stroke={w.color}
              strokeWidth={p.coreWidth}
              strokeDasharray={`${p.coreLen} ${p.period - p.coreLen}`}
              strokeDashoffset={p.coreOffset}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={p.coreOpacity}
              filter="drop-shadow(0 0 2.5px currentColor)"
            />
            <path
              className="current-flow-head"
              d={w.pathData}
              stroke="var(--flow-head)"
              strokeWidth={p.headWidth}
              strokeDasharray={`${p.headLen} ${p.period - p.headLen}`}
              strokeDashoffset={p.headOffset}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={p.headOpacity}
            />
          </g>
        );
      }),
    [animatedWires, zoom],
  );

  return (
    <g className="current-flow-layer" pointerEvents="none">
      {wireElements}
    </g>
  );
}
