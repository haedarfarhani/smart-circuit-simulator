import { useMemo } from 'react';
import type { CircuitDoc } from '../../models/circuit';
import { SYMBOLS } from '../../core/symbols';
import { useSimulationStore } from '../../store/simulationStore';
import { lampBrightness, lampLoad } from '../../core/flow';

/** Lamp glow driven entirely by the simulation snapshot.
 *
 * Brightness comes from the component's instantaneous power vs its watt
 * rating. The flicker is a small cosmetic modulation tied to the simulation
 * time (so it stays locked to the electrical clock), not an independent
 * timer. */
export function LampGlowLayer({
  doc,
  enabled,
}: {
  doc: CircuitDoc;
  enabled: boolean;
}) {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const simTime = useSimulationStore((s) => s.simTime);

  const lamps = useMemo(() => {
    if (!snapshot?.valid) return [];
    const out: { id: string; x: number; y: number; brightness: number; load: number }[] = [];
    for (const comp of doc.components) {
      if (comp.type !== 'lamp') continue;
      const sol = snapshot.componentData.get(comp.id);
      if (!sol) continue;
      const load = lampLoad(sol.power, comp.value);
      out.push({
        id: comp.id,
        x: comp.x,
        y: comp.y,
        brightness: lampBrightness(sol.power, comp.value),
        load,
      });
    }
    return out;
  }, [doc, snapshot]);

  if (!enabled || lamps.length === 0) return null;

  const t = simTime;

  return (
    <g className="lamp-glow-layer" pointerEvents="none">
      <defs>
        <radialGradient id="lampRadialBloom" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fffbeb" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#fbbf24" stopOpacity="0.65" />
          <stop offset="70%" stopColor="#f59e0b" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#d97706" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lampOverloadBloom" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="30%" stopColor="#f43f5e" stopOpacity="0.8" />
          <stop offset="70%" stopColor="#e11d48" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#9f1239" stopOpacity="0" />
        </radialGradient>
      </defs>

      {lamps.map((lamp) => {
        if (lamp.brightness <= 0.01) return null;
        // Cosmetic filament shimmer tied to the simulation clock
        const flicker =
          1 +
          0.04 * lamp.brightness * Math.sin(t * 240) +
          0.02 * lamp.brightness * Math.sin(t * 570);
        const over = lamp.load > 1.25;
        const radius = (26 + 18 * lamp.brightness) * flicker;

        return (
          <g
            key={lamp.id}
            className="lamp-glow"
            data-over={over}
            transform={`translate(${lamp.x},${lamp.y})`}
          >
            {/* Outer radial light bloom */}
            <circle
              r={radius}
              fill={over ? 'url(#lampOverloadBloom)' : 'url(#lampRadialBloom)'}
              opacity={Math.min(0.9, 0.6 + 0.35 * lamp.brightness)}
            />

            {/* Intense filament core glow */}
            <circle
              r={6 + 4 * lamp.brightness}
              fill="#fffdf0"
              opacity={Math.min(1, 0.85 + 0.15 * lamp.brightness)}
              style={{
                filter: over
                  ? 'drop-shadow(0 0 6px #f43f5e)'
                  : 'drop-shadow(0 0 5px #fbbf24)',
              }}
            />

            {/* Warning flare if overdriven */}
            {over && (
              <circle
                r={SYMBOLS.lamp.h / 2 + 8}
                fill="none"
                stroke="#f43f5e"
                strokeWidth={2}
                strokeDasharray="5 3"
                opacity={0.6 + 0.3 * Math.sin(t * 700)}
                style={{ filter: 'drop-shadow(0 0 4px #f43f5e)' }}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
