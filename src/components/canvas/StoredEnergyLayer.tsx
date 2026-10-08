import { useMemo } from 'react';
import type { CircuitDoc } from '../../models/circuit';
import { SYMBOLS } from '../../core/symbols';
import { DEFAULT_SOLENOID_INDUCTANCE } from '../../models/circuit';
import { useSimulationStore } from '../../store/simulationStore';
import {
  capacitorEnergy,
  estimateLoopResistance,
  formatEnergy,
  inductorEnergy,
  rcTimeConstant,
  rlTimeConstant,
} from '../../core/flow';

interface EnergyItem {
  id: string;
  label: string;
  kind: 'capacitor' | 'inductor';
  x: number;
  y: number;
  /** stored energy right now, from the solved state (J) */
  energy: number;
  /** steady-state energy the element can hold in this circuit (J) */
  refEnergy: number;
  /** the physical time constant shown to the user */
  physicalTau: number;
}

const BAR_W = 60;
const BAR_H = 5;

/**
 * Stored-energy readouts. Every value is read from the
 * simulation snapshot: the capacitor voltage and inductor
 * current the solver actually computed, so the energy bars
 * follow the physics (charging curves, AC ripple) instead
 * of an independent animation.
 */
export function StoredEnergyLayer({
  doc,
  enabled,
}: {
  doc: CircuitDoc;
  enabled: boolean;
}) {
  const snapshot = useSimulationStore((s) => s.snapshot);

  const items = useMemo<EnergyItem[]>(() => {
    if (!snapshot?.valid) return [];

    const supply = doc.components.find(
      (c) => c.type === 'battery' || c.type === 'acVoltageSource',
    );
    const supplyVoltage = supply
      ? Math.abs(supply.value)
      : 0;
    const resistances = doc.components
      .filter((c) => c.type !== 'capacitor' && c.type !== 'battery')
      .map((c) => c.value);
    const rEq = estimateLoopResistance(
      supplyVoltage,
      snapshot.componentData.get(supply?.id ?? '')?.current ?? 0,
      resistances,
    );

    const out: EnergyItem[] = [];
    for (const comp of doc.components) {
      if (comp.type !== 'capacitor' && comp.type !== 'solenoid') continue;
      const sol = snapshot.componentData.get(comp.id);
      if (!sol) continue;
      const def = SYMBOLS[comp.type];
      const halfH = def.h / 2;
      const baseY = comp.y + halfH + 48;

      if (comp.type === 'capacitor') {
        const c = Math.abs(comp.value);
        const vCap = sol.voltage; // actual capacitor voltage at this instant
        const physicalTau = rcTimeConstant(rEq, c);
        out.push({
          id: comp.id,
          label: comp.label,
          kind: 'capacitor',
          x: comp.x,
          y: baseY,
          // E = ½CV² from the solved state
          energy: capacitorEnergy(c, vCap),
          // reference: fully charged to the supply
          refEnergy: capacitorEnergy(c, supplyVoltage),
          physicalTau,
        });
      } else {
        // Solenoid / inductor
        const l = Math.abs(comp.inductance ?? DEFAULT_SOLENOID_INDUCTANCE);
        const iL = sol.current; // actual inductor current
        const physicalTau = rlTimeConstant(l, rEq);
        const iSteady = rEq > 0 ? supplyVoltage / rEq : 0;
        out.push({
          id: comp.id,
          label: comp.label,
          kind: 'inductor',
          x: comp.x,
          y: baseY,
          // E = ½LI² from the solved state
          energy: inductorEnergy(l, iL),
          // reference: steady-state current through the loop
          refEnergy: inductorEnergy(l, iSteady),
          physicalTau,
        });
      }
    }
    return out;
  }, [doc, snapshot]);

  if (!enabled || items.length === 0) return null;

  return (
    <g className="stored-energy-layer" pointerEvents="none">
      {items.map((item) => {
        const fraction =
          item.refEnergy > 0
            ? Math.max(0, Math.min(1, item.energy / item.refEnergy))
            : 0;
        const filled = fraction * BAR_W;
        const isCap = item.kind === 'capacitor';
        const color = isCap ? '#38bdf8' : '#fbbf24';

        return (
          <g
            key={item.id}
            className="stored-energy"
            transform={`translate(${item.x},${item.y})`}
          >
            {/* Dark protective card backdrop to avoid any text collision */}
            <rect
              className="stored-energy-bg"
              x={-BAR_W / 2 - 6}
              y={-14}
              width={BAR_W + 12}
              height={BAR_H + 26}
              rx={6}
              fill="rgba(6, 10, 16, 0.92)"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth={1}
              style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }}
            />

            {/* Energy value text */}
            <text
              className="stored-energy-text"
              textAnchor="middle"
              y={-3}
              fill={color}
              fontSize={9.5}
              fontFamily="var(--font-mono)"
              fontWeight="700"
            >
              {isCap ? 'E_C' : 'E_L'}: {formatEnergy(item.energy)}
            </text>

            {/* Track bar */}
            <rect
              className="stored-energy-bar"
              x={-BAR_W / 2}
              y={2}
              width={BAR_W}
              height={BAR_H}
              rx={2.5}
              fill="rgba(255, 255, 255, 0.08)"
            />

            {/* Filled bar with glowing lead */}
            <rect
              className={`stored-energy-fill ${item.kind}`}
              x={-BAR_W / 2}
              y={2}
              width={filled}
              height={BAR_H}
              rx={2.5}
              fill={color}
              style={{ filter: `drop-shadow(0 0 3px ${color})` }}
            />

            {/* Time constant tau */}
            <text
              className="stored-energy-tau"
              textAnchor="middle"
              y={BAR_H + 11}
              fill="var(--text-faint)"
              fontSize={8.5}
              fontFamily="var(--font-mono)"
            >
              τ: {formatTau(item.physicalTau)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function formatTau(tau: number): string {
  if (!Number.isFinite(tau) || tau <= 0) return '—';
  if (tau >= 1) return `${tau.toFixed(2)} s`;
  if (tau >= 1e-3) return `${(tau * 1e3).toFixed(1)} ms`;
  return `${(tau * 1e6).toFixed(0)} µs`;
}
