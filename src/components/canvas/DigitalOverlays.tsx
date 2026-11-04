/**
 * Live digital-state overlays, drawn from SimulationSnapshot data only.
 *
 * Every visual here is driven by `ComponentSolution.digital` /
 * `.sevenSeg` — never a timer, never a fake animation:
 *   - per-pin logic state dots with glyphs (0/1/X/Z), color + glyph so the
 *     state is readable without relying on color alone,
 *   - logic-input level, logic-output reading with measured voltage,
 *   - seven-segment segments lit from real segment currents,
 *   - counter value / register bits.
 */

import type { CircuitComponent } from '../../models/circuit';
import type { ComponentSolution } from '../../core/solver';
import { devicePins } from '../../core/digital/devices';
import { resolveDigitalCompParams } from '../../core/digital/types';
import { SEVEN_SEG_PATHS, LOGIC_STATE_COLORS } from '../../core/digitalSymbols';
import type { LogicValue } from '../../core/digital/logic';

const SEGMENT_COLORS: Record<string, { hex: string; glow: string }> = {
  red: { hex: '#ef4444', glow: 'rgba(239, 68, 68, 0.65)' },
  green: { hex: '#22c55e', glow: 'rgba(34, 197, 94, 0.65)' },
  blue: { hex: '#3b82f6', glow: 'rgba(59, 130, 246, 0.65)' },
  yellow: { hex: '#eab308', glow: 'rgba(234, 179, 8, 0.65)' },
  purple: { hex: '#a855f7', glow: 'rgba(168, 85, 247, 0.65)' },
  white: { hex: '#f8fafc', glow: 'rgba(248, 250, 252, 0.7)' },
};

/** Small filled dot + glyph at a pin, colored by logic state. */
function PinState({
  x,
  y,
  dx,
  value,
}: {
  x: number;
  y: number;
  dx: number;
  value: LogicValue;
}) {
  const color = LOGIC_STATE_COLORS[value];
  const cx = x - dx * 13;
  const hollow = value === 'Z';
  return (
    <g className="logic-pin-state" pointerEvents="none">
      <circle
        cx={cx}
        cy={y}
        r={7}
        fill={hollow ? 'var(--canvas-bg)' : color}
        stroke={color}
        strokeWidth={2}
      />
      <text
        x={cx}
        y={y + 0.5}
        fontSize={8}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={hollow ? color : '#ffffff'}
        style={{ paintOrder: 'stroke' }}
      >
        {value}
      </text>
    </g>
  );
}

export function DigitalStateOverlay({
  comp,
  compSolution,
}: {
  comp: CircuitComponent;
  compSolution: ComponentSolution | undefined;
}) {
  const params = resolveDigitalCompParams(comp);
  const pins = devicePins(comp.type, params);
  const digital = compSolution?.digital;
  const showLive = compSolution !== undefined;

  const nodes: React.ReactNode[] = [];

  // ---- Seven-segment display: light segments from real currents ----
  if (comp.type === 'seven-segment-display' && compSolution?.sevenSeg) {
    const seg = compSolution.sevenSeg;
    const colors = SEGMENT_COLORS[comp.color || 'red'] || SEGMENT_COLORS.red;
    seg.brightness.forEach((b, i) => {
      if (b <= 0.02) return;
      const path = SEVEN_SEG_PATHS[i];
      if (!path) return;
      nodes.push(
        <g key={`seg${i}`} pointerEvents="none">
          <path d={path.d} fill={colors.hex} opacity={0.35 + 0.65 * b}
            style={{ filter: `drop-shadow(0 0 ${3 + 5 * b}px ${colors.glow})` }} />
        </g>,
      );
    });
    // Over-current warning: red ring around the display.
    if (seg.brightness.some((b) => b >= 1) && (compSolution.current ?? 0) > 0.16) {
      nodes.push(
        <rect key="segwarn" x={-42} y={-88} width={84} height={186} rx={8}
          fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 3"
          pointerEvents="none" />,
      );
    }
    return <>{nodes}</>;
  }

  // ---- logic-input: level display, always visible (toggle feedback) ----
  if (comp.type === 'logic-input') {
    const v: LogicValue = comp.value === 1 ? '1' : '0';
    const color = LOGIC_STATE_COLORS[v];
    nodes.push(
      <g key="liv" pointerEvents="none">
        <rect x={-20} y={-20} width={40} height={40} rx={6} fill={color} opacity={0.22} />
        <text x={0} y={1} fontSize={13} fontWeight={750} textAnchor="middle" dominantBaseline="middle" fill={color}>
          {comp.value === 1 ? '1' : '0'}
        </text>
      </g>,
    );
  }

  // ---- logic-output: classified value + measured voltage ----
  if (comp.type === 'logic-output' && digital && showLive) {
    const v = digital.inputs[0] ?? 'Z';
    const color = LOGIC_STATE_COLORS[v];
    const volt = compSolution.voltage ?? 0;
    nodes.push(
      <g key="lov" pointerEvents="none">
        <rect x={-20} y={-20} width={40} height={40} rx={6} fill={color} opacity={v === '1' ? 0.25 : 0.12} />
        <text x={0} y={-1} fontSize={13} fontWeight={750} textAnchor="middle" dominantBaseline="middle" fill={color}>
          {v}
        </text>
        <text x={0} y={30} fontSize={7} textAnchor="middle" fill="var(--text-faint)" fontFamily="var(--font-mono)">
          {volt.toFixed(2)}V
        </text>
      </g>,
    );
  }

  // ---- counter value readout ----
  if (comp.type === 'counter' && digital && showLive) {
    const bits = digital.stateBits ?? [];
    const text = digital.count !== undefined && !bits.includes(-1)
      ? digital.count.toString(16).toUpperCase()
      : '—';
    nodes.push(
      <text key="cnt" x={0} y={-16} fontSize={11} fontWeight={700} textAnchor="middle"
        dominantBaseline="middle" fill="var(--text)" fontFamily="var(--font-mono)"
        pointerEvents="none">
        {text}
      </text>,
    );
  }

  // ---- register / shift-register bit boxes ----
  if ((comp.type === 'register' || comp.type === 'shift-register') && digital && showLive) {
    const bits = digital.stateBits ?? [];
    if (bits.length > 0 && bits.length <= 16) {
      const boxW = 9;
      const total = bits.length * (boxW + 2) - 2;
      const x0 = -total / 2;
      nodes.push(
        <g key="bits" pointerEvents="none">
          {bits.map((b, i) => (
            <g key={i}>
              <rect x={x0 + i * (boxW + 2)} y={-24} width={boxW} height={boxW} rx={1.5}
                fill={b === 1 ? LOGIC_STATE_COLORS['1'] : b === 0 ? 'var(--canvas-bg)' : LOGIC_STATE_COLORS.X}
                stroke={b === 0 ? 'var(--sym)' : 'none'} strokeWidth={1} />
              <text x={x0 + i * (boxW + 2) + boxW / 2} y={-24 + boxW / 2 + 0.5}
                fontSize={6.5} textAnchor="middle" dominantBaseline="middle"
                fill={b === 1 ? '#fff' : 'var(--text-faint)'} fontFamily="var(--font-mono)">
                {b === -1 ? 'X' : b}
              </text>
            </g>
          ))}
        </g>,
      );
    }
  }

  // ---- ALU op mnemonic ----
  if (comp.type === 'alu' && digital && showLive) {
    const opBits = ['OP0', 'OP1', 'OP2', 'OP3'].map((n) => {
      const idx = digital.inputNames.indexOf(n);
      return idx >= 0 ? digital.inputs[idx] : 'X';
    });
    if (opBits.every((b) => b === '0' || b === '1')) {
      const code = opBits.reduce((acc, b, i) => acc + (b === '1' ? 1 << i : 0), 0);
      const MNEMONICS = ['ADD', 'SUB', 'AND', 'OR', 'XOR', 'NOT', 'INC', 'DEC', 'CMP', 'SHL', 'SHR', 'SAR', 'NAND', 'NOR', 'XNOR', 'CLR'];
      nodes.push(
        <text key="op" x={0} y={-16} fontSize={9} fontWeight={700} textAnchor="middle"
          dominantBaseline="middle" fill="var(--accent)" fontFamily="var(--font-mono)"
          pointerEvents="none">
          {MNEMONICS[code] ?? '?'}
        </text>,
      );
    }
  }

  // ---- per-pin state dots ----
  if (digital && showLive) {
    let inIdx = 0;
    let outIdx = 0;
    for (const p of pins) {
      if (p.dir === 'in') {
        const v = digital.inputs[inIdx];
        if (v) nodes.push(<PinState key={`pi${inIdx}`} x={p.x} y={p.y} dx={p.dx} value={v} />);
        inIdx++;
      } else {
        const v = digital.outputs[outIdx];
        if (v) nodes.push(<PinState key={`po${outIdx}`} x={p.x} y={p.y} dx={p.dx} value={v} />);
        outIdx++;
      }
    }
  }

  return <>{nodes}</>;
}
