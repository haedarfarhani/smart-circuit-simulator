interface SolenoidPlungerProps {
  current: number;
}

const REST_X = 26;
const MAX_TRAVEL = 12;

export function SolenoidPlunger({ current }: SolenoidPlungerProps) {
  const absCurrent = Math.abs(current);
  const energized = absCurrent > 1e-6;
  const hue = current >= 0 ? 46 : 192;

  // Saturating pull-in displacement
  const pull = Math.min(1, absCurrent / 1.8);
  const rodX = REST_X - pull * MAX_TRAVEL;

  return (
    <g className="solenoid-plunger-overlay">
      {/* 1. Pulsating Electromagnetic Flux Arcs around the coil */}
      {energized && (
        <g className="solenoid-flux-arcs" opacity={0.65}>
          <path
            d="M -24 -24 Q 0 -34 24 -24"
            fill="none"
            stroke={`hsl(${hue}, 95%, 62%)`}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            style={{ filter: `drop-shadow(0 0 3px hsl(${hue}, 90%, 60%))` }}
          />
          <path
            d="M -24 24 Q 0 34 24 24"
            fill="none"
            stroke={`hsl(${hue}, 95%, 62%)`}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            style={{ filter: `drop-shadow(0 0 3px hsl(${hue}, 90%, 60%))` }}
          />
        </g>
      )}

      {/* 2. Solenoid Core & Coil Glow */}
      <rect
        className="solenoid-coil-glow"
        x={-25}
        y={-20}
        width={50}
        height={40}
        rx={3}
        fill={energized ? `hsla(${hue}, 90%, 60%, 0.12)` : 'none'}
        stroke={`hsl(${hue}, 90%, 60%)`}
        strokeWidth={energized ? 2 : 1}
        style={{
          filter: energized ? `drop-shadow(0 0 6px hsl(${hue}, 90%, 60%))` : 'none',
        }}
      />

      {/* 3. Moving Iron Plunger & Armature Shaft */}
      <rect
        className="solenoid-plunger"
        x={rodX}
        y={-6}
        width={16}
        height={12}
        rx={3}
        fill={`hsl(${hue}, 90%, 60%)`}
        stroke={`hsl(${hue}, 100%, 80%)`}
        strokeWidth={1.2}
        style={{
          filter: energized ? `drop-shadow(0 0 4px hsl(${hue}, 100%, 70%))` : 'none',
        }}
      />
      <line
        className="solenoid-plunger-rod"
        x1={rodX + 14}
        y1={0}
        x2={rodX + 28}
        y2={0}
        stroke={`hsl(${hue}, 95%, 72%)`}
        strokeWidth={2.8}
        strokeLinecap="round"
      />

      {/* 4. Isolated Force Badge with Pill Backdrop */}
      {energized && (
        <g className="solenoid-force-badge" transform="translate(0, -32)">
          <rect
            x={-30}
            y={-8}
            width={60}
            height={15}
            rx={7.5}
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
            F ∝ {absCurrent.toFixed(2)}A
          </text>
        </g>
      )}
    </g>
  );
}
