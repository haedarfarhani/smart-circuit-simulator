import { useState, useMemo } from 'react';
import {
  type ZenerParameters,
  generateZenerIVData,
  calculateZenerCurrent,
} from '../../core/zenerModel';

interface ZenerAnalyzerProps {
  params: ZenerParameters;
  tj?: number;
  currentOperatingPoint?: {
    voltage: number;
    current: number;
    state?: 'forward' | 'reverse-blocking' | 'breakdown';
    dynamicResistance?: number;
  };
  t?: (key: string) => string;
}

export function ZenerAnalyzer({
  params,
  tj = 25,
  currentOperatingPoint,
  t = (k) => k,
}: ZenerAnalyzerProps) {
  const [scaleMode, setScaleMode] = useState<'linear' | 'log'>('linear');
  const sweepMargin = 1.3; // multiplier of Vz
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; v: number; i: number } | null>(null);

  const vz = params.vzNominal || 5.1;
  const vMin = -Math.max(2, vz * sweepMargin);
  const vMax = 1.2;

  // Generate sweep points
  const curvePoints = useMemo(() => {
    return generateZenerIVData(params, tj, vMin, vMax, 150);
  }, [params, tj, vMin, vMax]);

  // Chart dimensions
  const width = 360;
  const height = 240;
  const padL = 48;
  const padR = 20;
  const padT = 24;
  const padB = 34;

  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  // Current limits for scaling
  // Linear scale: current range from negative (breakdown) to positive (forward)
  const maxI = 0.05; // 50 mA forward
  const minI = -0.06; // -60 mA breakdown

  // Mapping functions
  const xForV = (v: number) => {
    return padL + ((v - vMin) / (vMax - vMin)) * plotW;
  };

  const vForX = (x: number) => {
    return vMin + ((x - padL) / plotW) * (vMax - vMin);
  };

  const yForI = (i: number) => {
    if (scaleMode === 'linear') {
      const clamped = Math.max(minI, Math.min(maxI, i));
      return padT + plotH - ((clamped - minI) / (maxI - minI)) * plotH;
    } else {
      // Log scale: plot log10(abs(I)) vs V
      const absI = Math.max(1e-9, Math.abs(i));
      const logMin = -9; // 1 nA
      const logMax = -1; // 100 mA
      const logVal = Math.log10(absI);
      const frac = (logVal - logMin) / (logMax - logMin);
      return padT + plotH - Math.max(0, Math.min(1, frac)) * plotH;
    }
  };

  // Generate SVG path string
  const pathD = useMemo(() => {
    if (curvePoints.length === 0) return '';
    return curvePoints
      .map((pt, idx) => {
        const x = xForV(pt.v);
        const y = yForI(pt.i);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [curvePoints, scaleMode, vMin, vMax]);

  // Tangent line at operating point if available
  const tangentPoints = useMemo(() => {
    if (!currentOperatingPoint || scaleMode === 'log') return null;
    const { voltage: v0, current: i0, dynamicResistance: rz = params.rz || 10 } =
      currentOperatingPoint;
    if (v0 > 0.6 || v0 < -vz * 0.8) {
      // breakdown or forward slope: dI/dV = 1/rz
      const slope = 1 / Math.max(0.5, rz);
      const dv = 0.3;
      const v1 = v0 - dv;
      const i1 = i0 - slope * dv;
      const v2 = v0 + dv;
      const i2 = i0 + slope * dv;
      return {
        x1: xForV(v1),
        y1: yForI(i1),
        x2: xForV(v2),
        y2: yForI(i2),
      };
    }
    return null;
  }, [currentOperatingPoint, scaleMode, vMin, vMax, params.rz, vz]);

  // Zero axes positions
  const xZero = xForV(0);
  const yZero = scaleMode === 'linear' ? yForI(0) : padT + plotH;
  const xVz = xForV(-vz);

  // Export CSV
  const handleExportCSV = () => {
    const rows = ['Voltage (V),Current (A),Current (mA),Power (mW)'];
    for (const pt of curvePoints) {
      const p = Math.abs(pt.v * pt.i) * 1000;
      rows.push(`${pt.v.toFixed(4)},${pt.i.toExponential(4)},${(pt.i * 1000).toFixed(4)},${p.toFixed(3)}`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zener_iv_curve_${vz.toFixed(1)}V.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Hover detection
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < padL || x > width - padR) {
      setHoverPoint(null);
      return;
    }
    const v = vForX(x);
    const i = calculateZenerCurrent(v, params);
    const y = yForI(i);
    setHoverPoint({ x, y, v, i });
  };

  const handleMouseLeave = () => {
    setHoverPoint(null);
  };

  return (
    <div className="zener-analyzer-panel bg-slate-900/90 border border-slate-700/60 rounded-lg p-3 text-xs text-slate-200">
      {/* Header & Controls */}
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-700/50">
        <div className="flex items-center gap-1.5 font-semibold text-slate-100">
          <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]"></span>
          <span>{t('zener.ivCharacteristics') || 'I-V Characteristics Curve'}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Scale toggle */}
          <div className="flex bg-slate-800 rounded p-0.5 border border-slate-700">
            <button
              type="button"
              className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                scaleMode === 'linear'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => setScaleMode('linear')}
            >
              Linear
            </button>
            <button
              type="button"
              className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                scaleMode === 'log'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => setScaleMode('log')}
            >
              Log |I|
            </button>
          </div>
          {/* CSV Export */}
          <button
            type="button"
            className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-slate-200 transition-colors"
            onClick={handleExportCSV}
            title={t('zener.exportCsv') || 'Export curve data as CSV'}
          >
            CSV
          </button>
        </div>
      </div>

      {/* SVG Plot */}
      <div className="relative flex justify-center overflow-hidden">
        <svg
          width={width}
          height={height}
          className="select-none cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Region backgrounds */}
          {/* Breakdown region: v <= -Vz */}
          <rect
            x={padL}
            y={padT}
            width={Math.max(0, xVz - padL)}
            height={plotH}
            fill="rgba(6, 182, 212, 0.08)"
          />
          {/* Reverse blocking region: -Vz < v < 0 */}
          <rect
            x={Math.max(padL, xVz)}
            y={padT}
            width={Math.max(0, xZero - Math.max(padL, xVz))}
            height={plotH}
            fill="rgba(100, 116, 139, 0.05)"
          />
          {/* Forward region: v > 0 */}
          <rect
            x={xZero}
            y={padT}
            width={Math.max(0, width - padR - xZero)}
            height={plotH}
            fill="rgba(34, 197, 94, 0.08)"
          />

          {/* Grid lines */}
          <line
            x1={padL}
            y1={yZero}
            x2={width - padR}
            y2={yZero}
            stroke="#475569"
            strokeWidth={1}
            strokeDasharray={scaleMode === 'linear' ? 'none' : '2 2'}
          />
          <line
            x1={xZero}
            y1={padT}
            x2={xZero}
            y2={height - padB}
            stroke="#475569"
            strokeWidth={1}
          />

          {/* Breakdown knee line (-Vz) */}
          <line
            x1={xVz}
            y1={padT}
            x2={xVz}
            y2={height - padB}
            stroke="#06b6d4"
            strokeWidth={1.2}
            strokeDasharray="3 3"
          />
          <text
            x={xVz}
            y={padT + 12}
            fill="#38bdf8"
            fontSize={9}
            textAnchor="end"
            dx={-4}
            fontWeight="bold"
          >
            -Vz ({(-vz).toFixed(1)}V)
          </text>

          {/* Region labels */}
          <text
            x={(padL + xVz) / 2}
            y={height - padB - 6}
            fill="#38bdf8"
            fontSize={8.5}
            textAnchor="middle"
            opacity={0.8}
          >
            {t('zener.breakdown') || 'Breakdown'}
          </text>
          <text
            x={(xVz + xZero) / 2}
            y={height - padB - 6}
            fill="#94a3b8"
            fontSize={8.5}
            textAnchor="middle"
            opacity={0.8}
          >
            {t('zener.blocking') || 'Blocking'}
          </text>
          <text
            x={(xZero + width - padR) / 2}
            y={height - padB - 6}
            fill="#4ade80"
            fontSize={8.5}
            textAnchor="middle"
            opacity={0.8}
          >
            {t('zener.forward') || 'Forward'}
          </text>

          {/* Axis Labels */}
          <text
            x={width - padR}
            y={yZero - 4}
            fill="#94a3b8"
            fontSize={9}
            textAnchor="end"
          >
            V (V)
          </text>
          <text
            x={padL - 4}
            y={padT + 8}
            fill="#94a3b8"
            fontSize={9}
            textAnchor="end"
          >
            {scaleMode === 'linear' ? 'I (mA)' : 'log|I|'}
          </text>

          {/* Y-axis Ticks for linear */}
          {scaleMode === 'linear' && (
            <>
              <text x={padL - 6} y={yForI(0.04) + 3} fill="#64748b" fontSize={8} textAnchor="end">
                +40
              </text>
              <text x={padL - 6} y={yForI(0) + 3} fill="#64748b" fontSize={8} textAnchor="end">
                0
              </text>
              <text x={padL - 6} y={yForI(-0.04) + 3} fill="#64748b" fontSize={8} textAnchor="end">
                -40
              </text>
            </>
          )}

          {/* X-axis Ticks */}
          <text x={xForV(vMin) + 8} y={height - padB + 14} fill="#64748b" fontSize={8}>
            {vMin.toFixed(0)}V
          </text>
          <text x={xZero} y={height - padB + 14} fill="#64748b" fontSize={8} textAnchor="middle">
            0V
          </text>
          <text x={xForV(vMax) - 6} y={height - padB + 14} fill="#64748b" fontSize={8} textAnchor="end">
            +{vMax.toFixed(1)}V
          </text>

          {/* Tangent line at operating point */}
          {tangentPoints && (
            <line
              x1={tangentPoints.x1}
              y1={tangentPoints.y1}
              x2={tangentPoints.x2}
              y2={tangentPoints.y2}
              stroke="#fbbf24"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          )}

          {/* Main I-V Curve */}
          <path
            d={pathD}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={2.2}
            strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 3px rgba(56, 189, 248, 0.5))' }}
          />

          {/* Current Operating Point Marker */}
          {currentOperatingPoint && (
            (() => {
              const opX = xForV(currentOperatingPoint.voltage);
              const opY = yForI(currentOperatingPoint.current);
              const inBounds = opX >= padL && opX <= width - padR && opY >= padT && opY <= height - padB;
              if (!inBounds) return null;
              return (
                <g>
                  {/* Glowing halo */}
                  <circle
                    cx={opX}
                    cy={opY}
                    r={7}
                    fill="rgba(244, 63, 94, 0.25)"
                    style={{ filter: 'drop-shadow(0 0 6px #f43f5e)' }}
                  />
                  {/* Dot */}
                  <circle
                    cx={opX}
                    cy={opY}
                    r={3.5}
                    fill="#f43f5e"
                    stroke="#ffffff"
                    strokeWidth={1.2}
                  />
                  {/* Operating label */}
                  <text
                    x={opX + (opX > width - 100 ? -8 : 8)}
                    y={opY - 8}
                    fill="#fecdd3"
                    fontSize={9}
                    fontWeight="bold"
                    textAnchor={opX > width - 100 ? 'end' : 'start'}
                  >
                    Q: {currentOperatingPoint.voltage.toFixed(2)}V, {(currentOperatingPoint.current * 1000).toFixed(1)}mA
                  </text>
                </g>
              );
            })()
          )}

          {/* Hover Crosshair & Tooltip */}
          {hoverPoint && (
            <g>
              <line
                x1={hoverPoint.x}
                y1={padT}
                x2={hoverPoint.x}
                y2={height - padB}
                stroke="#94a3b8"
                strokeWidth={0.8}
                strokeDasharray="2 2"
              />
              <line
                x1={padL}
                y1={hoverPoint.y}
                x2={width - padR}
                y2={hoverPoint.y}
                stroke="#94a3b8"
                strokeWidth={0.8}
                strokeDasharray="2 2"
              />
              <circle
                cx={hoverPoint.x}
                cy={hoverPoint.y}
                r={3}
                fill="#38bdf8"
                stroke="#ffffff"
                strokeWidth={1}
              />
            </g>
          )}
        </svg>

        {/* Hover Readout Box */}
        {hoverPoint && (
          <div
            className="absolute pointer-events-none bg-slate-950/95 border border-cyan-500/50 rounded px-2 py-1 text-[10px] text-cyan-200 shadow-lg z-10"
            style={{
              left: Math.min(width - 110, Math.max(10, hoverPoint.x - 40)),
              top: Math.max(5, hoverPoint.y - 36),
            }}
          >
            <div>V: <span className="font-mono font-bold text-white">{hoverPoint.v.toFixed(3)} V</span></div>
            <div>I: <span className="font-mono font-bold text-white">{(hoverPoint.i * 1000).toFixed(2)} mA</span></div>
          </div>
        )}
      </div>

      {/* Footer Details: Dynamic Resistance & Tangent Legend */}
      <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800 text-[10px] text-slate-400">
        <div>
          <span>rz = </span>
          <span className="font-mono text-cyan-300 font-semibold">{params.rz || 10} Ω</span>
          <span className="ml-2">Izt = </span>
          <span className="font-mono text-slate-300">{((params.izt || 0.02) * 1000).toFixed(0)} mA</span>
        </div>
        {currentOperatingPoint && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-0.5 bg-amber-400"></span>
            <span>rz tangent: </span>
            <span className="font-mono text-amber-300">
              {(currentOperatingPoint.dynamicResistance ?? params.rz ?? 10).toFixed(1)} Ω
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
