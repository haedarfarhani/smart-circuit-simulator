import { useMemo } from 'react';
import type { CSSProperties } from 'react';

interface MotorRotorProps {
  current: number;
  currentDirection: number;
  /**
   * Shaft speed in RPM, computed by the electrical solver from
   * the motor's operating point. When omitted, a fallback
   * estimate proportional to the current is used — it still
   * goes to zero when the current does.
   */
  rpm?: number;
  /**
   * Fixed running speed for an AC machine, whose shaft speed is set by
   * the supply frequency rather than by the current it draws.
   */
  synchronousRpm?: number;
}

/** Spokes of the armature, from the hub outwards, in local coordinates. */
const HUB_R = 5;
const SPOKE_R = 20;
const SPOKES = 6;

export function MotorRotor({ current, currentDirection, rpm, synchronousRpm }: MotorRotorProps) {
  const absCurrent = Math.abs(current);
  // The solver-derived RPM wins; the fallback keeps the standalone
  // symbol meaningful and still stops at zero current.
  const rpmValue =
    rpm !== undefined
      ? rpm
      : synchronousRpm ?? Math.min(3000, absCurrent * 600);
  const direction = currentDirection >= 0 ? 1 : -1;
  const hue = currentDirection > 0 ? 46 : 192; // Amber for conventional (+), Cyan for (-)

  // Large machines turn far too fast to draw one revolution per revolution;
  // the spin is a visual cue and the badge carries the real figure.
  const secondsPerTurn = Math.min(2.0, Math.max(0.3, 60 / Math.max(rpmValue, 1)));
  const spinning = rpmValue > 1 && absCurrent > 1e-6;

  const spokes = useMemo(() => {
    const out: { path: string; tipX: number; tipY: number }[] = [];
    for (let i = 0; i < SPOKES; i++) {
      const a = (i * (360 / SPOKES) * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      out.push({
        path: `M ${HUB_R * cos} ${HUB_R * sin} L ${SPOKE_R * cos} ${SPOKE_R * sin}`,
        tipX: SPOKE_R * cos,
        tipY: SPOKE_R * sin,
      });
    }
    return out;
  }, []);

  return (
    <g className="motor-rotor-overlay">
      {/* 1. Stator Magnetic Flux Ring (spinning in active state) */}
      <circle
        className="motor-stator-flux"
        cx={0}
        cy={0}
        r={25.5}
        fill="none"
        stroke={`hsl(${hue}, 95%, 62%)`}
        strokeWidth={1.4}
        strokeDasharray="6 4"
        opacity={spinning ? 0.75 : 0.2}
        style={{
          animation: spinning
            ? `motorSpin${direction > 0 ? '' : '-reverse'} ${secondsPerTurn.toFixed(2)}s linear infinite`
            : 'none',
          filter: spinning ? `drop-shadow(0 0 4px hsl(${hue}, 90%, 60%))` : 'none',
        }}
      />

      {/* 2. Rotating Armature with Spokes and Tip Dots */}
      <g
        className="motor-rotor"
        style={
          {
            animation: spinning
              ? `motorSpin${direction > 0 ? '' : '-reverse'} ${secondsPerTurn.toFixed(2)}s linear infinite`
              : 'none',
            '--motor-hue': hue,
          } as CSSProperties
        }
      >
        {spokes.map((spoke, i) => (
          <g key={i}>
            <path
              d={spoke.path}
              className="motor-rotor-bar"
              stroke={`hsl(${hue}, 95%, 65%)`}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
            <circle
              cx={spoke.tipX}
              cy={spoke.tipY}
              r={1.8}
              fill={`hsl(${hue}, 100%, 80%)`}
            />
          </g>
        ))}

        {/* Central armature hub */}
        <circle
          className="motor-rotor-hub"
          r={HUB_R}
          fill={`hsl(${hue}, 95%, 60%)`}
          stroke="#ffffff"
          strokeWidth={1}
          style={{ filter: `drop-shadow(0 0 3px hsl(${hue}, 100%, 70%))` }}
        />
      </g>

      {/* 3. Commutator brush sparkles */}
      {spinning && (
        <g className="motor-brushes">
          <circle cx={-13} cy={0} r={1.5} fill="#ffffff" opacity={0.8} />
          <circle cx={13} cy={0} r={1.5} fill="#ffffff" opacity={0.8} />
        </g>
      )}

      {/* 4. Sleek RPM badge with dedicated dark backdrop pill */}
      {spinning && (
        <g className="motor-rpm-badge" transform="translate(0, -36)">
          <rect
            x={-28}
            y={-8}
            width={56}
            height={16}
            rx={8}
            fill="rgba(8, 12, 20, 0.92)"
            stroke={`hsl(${hue}, 85%, 55%)`}
            strokeWidth={1}
            style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.5))' }}
          />
          <text
            y={3.5}
            textAnchor="middle"
            fill={`hsl(${hue}, 95%, 75%)`}
            fontSize={9.5}
            fontFamily="var(--font-mono)"
            fontWeight="700"
          >
            {Math.round(rpmValue)} RPM
          </text>
        </g>
      )}
    </g>
  );
}
