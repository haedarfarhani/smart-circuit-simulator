import { useLayoutEffect, useRef, useState } from 'react';
import { makeT } from '../../i18n';
import { SYMBOLS } from '../../core/symbols';
import type { CircuitTopology } from '../../core/solver';
import { nodeReport } from '../../core/nodeInfo';
import type { CircuitDoc } from '../../models/circuit';
import { useUiStore } from '../../store/uiStore';
import type { SimSnapshot } from '../../store/simulationStore';
import type { SolverResult } from '../../core/solver';

/** Shaped the same for the node layer whether the data came from the old
 * steady-state solver or the new time-domain snapshot. */
interface NodeDataProvider {
  valid: boolean;
  isValid?: boolean;
  nodeVoltages: Map<string, number>;
  componentData: Map<string, import('../../core/solver').ComponentSolution>;
  wireCurrents: Map<string, number>;
}

function formatVolts(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) < 0.001) return '0 V';
  return `${v.toFixed(3)} V`;
}

function formatAmps(i: number): string {
  if (!Number.isFinite(i)) return '—';
  if (Math.abs(i) < 1e-9) return '0 A';
  if (Math.abs(i) < 1) return `${(i * 1000).toFixed(3)} mA`;
  return `${i.toFixed(3)} A`;
}

/**
 * Voltage of every node, drawn at the node itself. Read-only layer: node
 * hovering is resolved geometrically by the canvas, so this never takes
 * pointer events away from terminals, wires or components.
 */
export function NodeVoltageLayer({
  topology,
  solverResult,
  hoveredNodeId,
}: {
  topology: CircuitTopology | null;
  solverResult: NodeDataProvider | null;
  hoveredNodeId: string | null;
}) {
  if (!topology || !solverResult || (!solverResult.valid && !solverResult.isValid)) return null;

  return (
    <g className="node-layer" pointerEvents="none">
      {[...topology.nodes.values()].map((node) => {
        const voltage = solverResult.nodeVoltages.get(node.id) ?? 0;
        const hot = node.id === hoveredNodeId;
        return (
          <g
            key={node.id}
            className="node-marker"
            data-hot={hot}
            transform={`translate(${node.x},${node.y})`}
          >
            <circle className="node-dot" r={hot ? 5 : 3.5} />
            <rect
              className="node-voltage-pill"
              x={-20}
              y={-21}
              width={40}
              height={14}
              rx={4}
              fill="rgba(6, 10, 16, 0.92)"
              stroke={hot ? 'var(--accent)' : 'rgba(255, 255, 255, 0.12)'}
              strokeWidth={hot ? 1.2 : 0.8}
            />
            <text className="node-voltage" y={-10.5} textAnchor="middle">
              {formatVolts(voltage)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Hover card for one node: voltage plus the current in each branch. */
export function NodePopup({
  doc,
  topology,
  solverResult,
  hit,
  zoom,
  panX,
  panY,
}: {
  doc: CircuitDoc;
  topology: CircuitTopology | null;
  solverResult: NodeDataProvider | null;
  hit: { nodeId: string; point: { x: number; y: number } };
  zoom: number;
  panX: number;
  panY: number;
}) {
  const t = makeT(useUiStore((s) => s.locale));
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const pr = parent.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    setFlip(er.right > pr.right - 4);
  }, [hit.nodeId, hit.point.x, hit.point.y]);

  if (!topology || !solverResult) return null;

  const report = nodeReport(doc, topology, solverResult as (SolverResult | SimSnapshot) | null, hit.nodeId);
  if (!report) return null;

  const left = panX + hit.point.x * zoom;
  const top = panY + hit.point.y * zoom;

  return (
    <div
      ref={ref}
      className="node-popup"
      data-side={flip ? 'left' : 'right'}
      style={{ left, top }}
      role="tooltip"
    >
      <div className="node-popup-head">
        <span className="node-popup-id">{t('node.label')}</span>
        <span className="node-popup-voltage">{formatVolts(report.voltage)}</span>
      </div>
      {report.branches.length === 0 ? (
        <div className="node-popup-empty">{t('node.noBranches')}</div>
      ) : (
        <table className="node-popup-branches">
          <tbody>
            {report.branches.map((b) => (
              <tr key={`${b.kind}:${b.id}`}>
                <td className="node-branch-label">{b.label}</td>
                <td className="node-branch-kind">
                  {b.type === 'wire'
                    ? t('node.wire')
                    : (SYMBOLS[b.type as keyof typeof SYMBOLS]?.prefix ?? b.type)}
                </td>
                <td className="node-branch-current">
                  <span className="node-branch-arrow">
                    {b.through ? '↕' : b.leaving ? '→' : '←'}
                  </span>
                  {formatAmps(b.current)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="node-popup-hint">{t('node.hint')}</div>
    </div>
  );
}
