import { useMemo, useRef, useState } from 'react';
import {
  bjtLinearization,
  type BjtParameters,
  type BjtRegion,
} from '../../core/bjtModel';

type Tab = 'input' | 'output' | 'transfer';

interface Props {
  params: BjtParameters;
  /** junction temperature used for the sweep (°C) */
  tj?: number;
  /** solved operating point, when the circuit is running */
  operatingPoint?: {
    vbe: number;
    vce: number;
    ib: number;
    ic: number;
    region: BjtRegion;
  } | null;
  t?: (key: string) => string;
}

interface Point {
  x: number;
  y: number;
}

const W = 380;
const H = 250;
const PAD_L = 52;
const PAD_R = 16;
const PAD_T = 20;
const PAD_B = 36;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

/** Base-emitter sweep used by the input and transfer curves. */
const VBE_MIN = 0.35;
const VBE_MAX = 0.82;
/** Base drives (in VBE) for the output family of curves. */
const OUTPUT_DRIVES = [0.58, 0.62, 0.66, 0.7, 0.74];

/**
 * Transistor characteristic analyzer.
 *
 * Every curve is evaluated with the same Ebers-Moll / simplified model the
 * solver uses (`bjtLinearization`), so the plots never disagree with the
 * circuit. For a PNP the axes show device magnitudes (|VCE|, |IC|) and the
 * sign convention is flipped internally.
 */
export function BjtAnalyzer({ params, tj = 25, operatingPoint, t = (k) => k }: Props) {
  const [tab, setTab] = useState<Tab>('output');
  const [logScale, setLogScale] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const sign = params.transistorType === 'npn' ? 1 : -1;

  const evaluate = (vbeMag: number, vceMag: number) => {
    const lin = bjtLinearization(params, sign * vbeMag, sign * vceMag, 0, tj);
    return {
      ib: Math.abs(lin.ib),
      ic: Math.abs(lin.ic),
      region: lin.region,
    };
  };

  const vceMax = Math.max(4, Math.abs(operatingPoint?.vce ?? 0) * 2.5);
  const vbeSpan = VBE_MAX - VBE_MIN;

  const curves = useMemo(() => {
    if (tab === 'input') {
      const fixedVce = Math.max(1, Math.abs(operatingPoint?.vce ?? 0));
      const pts: Point[] = [];
      for (let i = 0; i <= 120; i++) {
        const vbe = VBE_MIN + (vbeSpan * i) / 120;
        pts.push({ x: vbe, y: evaluate(vbe, fixedVce).ib });
      }
      return [{ key: 'IB', color: '#38bdf8', points: pts }];
    }
    if (tab === 'output') {
      return OUTPUT_DRIVES.map((drive, idx) => {
        const pts: Point[] = [];
        for (let i = 0; i <= 100; i++) {
          const vce = (vceMax * i) / 100;
          pts.push({ x: vce, y: evaluate(drive, vce).ic });
        }
        const labelIb = evaluate(drive, Math.max(1, vceMax / 2)).ib;
        return {
          key: `IB=${formatCurrent(labelIb)}`,
          color: ['#38bdf8', '#22c55e', '#eab308', '#f97316', '#f43f5e'][idx % 5],
          points: pts,
        };
      });
    }
    const fixedVce = Math.max(1, Math.abs(operatingPoint?.vce ?? 0));
    const pts: Point[] = [];
    for (let i = 0; i <= 120; i++) {
      const vbe = VBE_MIN + (vbeSpan * i) / 120;
      const at = evaluate(vbe, fixedVce);
      if (at.ib > 0) pts.push({ x: at.ib, y: at.ic });
    }
    return [{ key: 'IC(IB)', color: '#eab308', points: pts }];
  }, [params, tab, tj, vceMax, vbeSpan, sign, operatingPoint?.vce]);

  const yMax = useMemo(() => {
    let m = 0;
    for (const c of curves) for (const p of c.points) if (p.y > m) m = p.y;
    if (operatingPoint) {
      m = Math.max(m, Math.abs(openingValue(operatingPoint, tab)));
    }
    return m > 0 ? m * 1.08 : 1e-3;
  }, [curves, operatingPoint, tab]);

  const xMax = tab === 'output' ? vceMax : tab === 'transfer' ? Math.max(
    1e-7,
    ...curves.flatMap((c) => c.points.map((p) => p.x)),
  ) * 1.05 : VBE_MAX;
  const xMin = tab === 'input' ? VBE_MIN : 0;

  const xFor = (v: number) =>
    PAD_L + ((v - xMin) / Math.max(1e-12, xMax - xMin)) * PLOT_W * zoom + pan.x;
  const yFor = (i: number) => {
    if (logScale) {
      const abs = Math.max(1e-9, Math.abs(i));
      const frac = (Math.log10(abs) + 9) / (Math.log10(yMax) + 9);
      return PAD_T + PLOT_H - Math.max(0, Math.min(1, frac)) * PLOT_H * zoom + pan.y;
    }
    return PAD_T + PLOT_H - (Math.max(0, i) / yMax) * PLOT_H * zoom + pan.y;
  };
  const vForX = (x: number) =>
    xMin + ((x - PAD_L - pan.x) / (PLOT_W * zoom)) * (xMax - xMin);
  const iForY = (y: number) => {
    const frac = (PAD_T + PLOT_H - y + pan.y) / (PLOT_H * zoom);
    if (logScale) return Math.pow(10, -9 + frac * (Math.log10(yMax) + 9));
    return Math.max(0, frac * yMax);
  };

  const xLabel = tab === 'output' ? 'VCE (V)' : tab === 'transfer' ? 'IB (A)' : 'VBE (V)';
  const yLabel = tab === 'input' ? 'IB (A)' : 'IC (A)';

  const qPoint = operatingPoint
    ? tab === 'input'
      ? { x: Math.abs(operatingPoint.vbe), y: Math.abs(operatingPoint.ib) }
      : tab === 'transfer'
        ? { x: Math.abs(operatingPoint.ib), y: Math.abs(operatingPoint.ic) }
        : { x: Math.abs(operatingPoint.vce), y: Math.abs(operatingPoint.ic) }
    : null;

  const exportCsv = () => {
    const rows = ['curve,point,x,y'];
    curves.forEach((c) => {
      c.points.forEach((p, i) => rows.push(`${c.key},${i},${p.x},${p.y}`));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bjt-${tab}-${params.transistorType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drag.current) {
      const d = drag.current;
      setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    if (x < PAD_L || x > W - PAD_R || y < PAD_T || y > H - PAD_B) {
      setHover(null);
      return;
    }
    const vx = vForX(x);
    const iy = iForY(y);
    setHover({
      x,
      y,
      label:
        tab === 'input'
          ? `${vx.toFixed(3)} V · ${formatCurrent(iy)}`
          : tab === 'transfer'
            ? `${formatCurrent(vx)} · ${formatCurrent(iy)}`
            : `${vx.toFixed(3)} V · ${formatCurrent(iy)}`,
    });
  };

  return (
    <div className="bjt-analyzer" style={{ marginTop: 10 }}>
      <div className="bjt-analyzer-toolbar">
        {(
          [
            ['input', t('bjt.curve.input')],
            ['output', t('bjt.curve.output')],
            ['transfer', t('bjt.curve.transfer')],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`bjt-chip ${tab === id ? 'active' : ''}`}
            onClick={() => {
              setTab(id);
              reset();
            }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={`bjt-chip ${logScale ? 'active' : ''}`}
          onClick={() => setLogScale((v) => !v)}
          title={t('bjt.curve.log')}
        >
          log
        </button>
        <button type="button" className="bjt-chip" onClick={reset} title={t('bjt.curve.reset')}>
          ↺
        </button>
        <button type="button" className="bjt-chip" onClick={exportCsv} title={t('bjt.curve.export')}>
          CSV
        </button>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={t('bjt.curve.title')}
        style={{ touchAction: 'none', cursor: drag.current ? 'grabbing' : 'grab' }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
          setHover(null);
        }}
        onPointerMove={onMove}
        onWheel={(e) => {
          e.preventDefault();
          setZoom((z) => Math.min(4, Math.max(0.5, z * (e.deltaY < 0 ? 1.15 : 0.87))));
        }}
      >
        <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="rgba(255,255,255,0.02)" />
        {/* grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD_L}
            x2={PAD_L + PLOT_W}
            y1={PAD_T + PLOT_H * f}
            y2={PAD_T + PLOT_H * f}
            stroke="rgba(255,255,255,0.08)"
          />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            y1={PAD_T}
            y2={PAD_T + PLOT_H}
            x1={PAD_L + PLOT_W * f}
            x2={PAD_L + PLOT_W * f}
            stroke="rgba(255,255,255,0.08)"
          />
        ))}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="var(--text-faint)" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="var(--text-faint)" />
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
          {xLabel}
        </text>
        <text
          x={12}
          y={H / 2}
          textAnchor="middle"
          fontSize="10"
          fill="var(--text-muted)"
          transform={`rotate(-90 12 ${H / 2})`}
        >
          {yLabel}
        </text>

        {curves.map((c) => {
          const d = c.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.x).toFixed(1)} ${yFor(p.y).toFixed(1)}`)
            .join(' ');
          return (
            <g key={c.key}>
              <path d={d} fill="none" stroke={c.color} strokeWidth={1.8} />
            </g>
          );
        })}

        {qPoint && (
          <g>
            <line
              x1={xFor(qPoint.x)}
              y1={PAD_T}
              x2={xFor(qPoint.x)}
              y2={H - PAD_B}
              stroke="var(--accent)"
              strokeDasharray="3 3"
              opacity={0.7}
            />
            <line
              x1={PAD_L}
              y1={yFor(qPoint.y)}
              x2={W - PAD_R}
              y2={yFor(qPoint.y)}
              stroke="var(--accent)"
              strokeDasharray="3 3"
              opacity={0.7}
            />
            <circle cx={xFor(qPoint.x)} cy={yFor(qPoint.y)} r={4} fill="var(--accent)" />
          </g>
        )}

        {hover && (
          <g>
            <line x1={hover.x} y1={PAD_T} x2={hover.x} y2={H - PAD_B} stroke="rgba(255,255,255,0.25)" />
            <line x1={PAD_L} y1={hover.y} x2={W - PAD_R} y2={hover.y} stroke="rgba(255,255,255,0.25)" />
            <text x={Math.min(W - 120, hover.x + 6)} y={Math.max(PAD_T + 12, hover.y - 6)} fontSize="10" fill="var(--text)">
              {hover.label}
            </text>
          </g>
        )}
      </svg>

      <div className="bjt-legend">
        {curves.map((c) => (
          <span key={c.key}>
            <i style={{ background: c.color }} /> {c.key}
          </span>
        ))}
        {operatingPoint && (
          <span className="bjt-q">
            {t('bjt.curve.qpoint')}: {formatCurrent(Math.abs(operatingPoint.ic))} ·{' '}
            {Math.abs(operatingPoint.vce).toFixed(2)} V
          </span>
        )}
      </div>
    </div>
  );
}

function openingValue(
  op: { vbe: number; vce: number; ib: number; ic: number },
  tab: Tab,
): number {
  if (tab === 'input') return Math.abs(op.ib);
  return Math.abs(op.ic);
}

function formatCurrent(v: number): string {
  const a = Math.abs(v);
  if (!Number.isFinite(a)) return '— A';
  if (a >= 1) return `${v.toFixed(3)} A`;
  if (a >= 1e-3) return `${(v * 1e3).toFixed(3)} mA`;
  if (a >= 1e-6) return `${(v * 1e6).toFixed(2)} µA`;
  if (a >= 1e-9) return `${(v * 1e9).toFixed(2)} nA`;
  return `${v.toExponential(2)} A`;
}
