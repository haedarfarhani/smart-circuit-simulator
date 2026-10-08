/**
 * Oscilloscope panel — redesigned for clarity and comfort.
 *
 * Renders the REAL measurement history of the configured
 * probes (simulation store ring buffers). Nothing here
 * generates waveform data.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import { useUiStore } from '../../store/uiStore';
import { useCircuitStore } from '../../store/circuitStore';
import { channelHasMeasurement, useProbeStore } from '../../store/probeStore';
import {
  CHANNEL_COLORS,
  CHANNEL_IDS,
  CURRENT_DIV_OPTIONS,
  TIME_DIV_OPTIONS,
  VOLTAGE_DIV_OPTIONS,
  channelTargetState,
  computeStats,
  findTriggerTime,
  stepTimeDiv,
  type ChannelId,
  type ChannelSample,
  type OscilloscopeChannel,
} from '../../models/probe';
import { formatValue } from '../../core/labels';
import { makeT } from '../../i18n';

const GRID_X = 10;
const GRID_Y = 8;

function formatTime(seconds: number): string {
  return formatValue(seconds, 's');
}

function formatMag(value: number, unit: string): string {
  return formatValue(value, unit);
}

function valueAt(samples: readonly ChannelSample[], t: number): number | null {
  if (samples.length === 0) return null;
  if (t <= samples[0].t) return samples[0].value;
  if (t >= samples[samples.length - 1].t) return samples[samples.length - 1].value;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return a.value + f * (b.value - a.value);
}

function visibleSamples(
  samples: readonly ChannelSample[],
  t0: number,
  t1: number,
  coupling: 'dc' | 'ac',
): { t: number; value: number }[] {
  const out: { t: number; value: number }[] = [];
  let sum = 0;
  let count = 0;
  for (const s of samples) {
    if (s.t < t0) continue;
    if (s.t > t1) break;
    out.push({ t: s.t, value: s.value });
    sum += s.value;
    count++;
  }
  if (coupling === 'ac' && count > 0) {
    const mean = sum / count;
    for (const s of out) s.value -= mean;
  }
  return out;
}

/** Effective V/div or A/div for one channel (auto = fill ~4 divs). */
function effectiveScale(
  ch: OscilloscopeChannel,
  vs: readonly { value: number }[],
): number {
  if (ch.scale > 0) return ch.scale;
  let maxAbs = 0;
  for (const s of vs) maxAbs = Math.max(maxAbs, Math.abs(s.value));
  const raw = maxAbs / 4;
  const options = ch.type === 'voltage' ? VOLTAGE_DIV_OPTIONS : CURRENT_DIV_OPTIONS;
  if (!(raw > 0)) return options[Math.min(5, options.length - 1)];
  for (const opt of options) {
    if (raw <= opt) return opt;
  }
  return options[options.length - 1];
}

interface WindowInfo {
  latestT: number;
  tTrig: number | null;
  windowStart: number;
  windowEnd: number;
}

function computeWindow(
  enabled: OscilloscopeChannel[],
  channelSamples: Record<ChannelId, ChannelSample[]>,
  trigger: { source: ChannelId; level: number; edge: 'rising' | 'falling'; mode: string },
  timeDiv: number,
): WindowInfo {
  const latestT =
    enabled.length > 0
      ? Math.max(...enabled.map((c) => channelSamples[c.id][channelSamples[c.id].length - 1]?.t ?? 0))
      : 0;
  const trigBuf = channelSamples[trigger.source] ?? [];
  let tTrig = findTriggerTime(trigBuf, trigger.level, trigger.edge as 'rising' | 'falling');
  if (tTrig == null) tTrig = trigger.mode === 'auto' ? latestT : null;
  const windowEnd = tTrig != null ? tTrig + 8 * timeDiv : latestT;
  const windowStart = windowEnd - GRID_X * timeDiv;
  return { latestT, tTrig, windowStart, windowEnd };
}

export function Oscilloscope() {
  const locale = useUiStore((s) => s.locale);
  const t = makeT(locale);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const channels = useProbeStore((s) => s.channels);
  const trigger = useProbeStore((s) => s.trigger);
  const timeDiv = useProbeStore((s) => s.timeDiv);
  const selectedChannelId = useProbeStore((s) => s.selectedChannelId);
  const updateChannel = useProbeStore((s) => s.updateChannel);
  const removeChannel = useProbeStore((s) => s.removeChannel);
  const setTrigger = useProbeStore((s) => s.setTrigger);
  const setTimeDiv = useProbeStore((s) => s.setTimeDiv);
  const locateChannel = useProbeStore((s) => s.locateChannel);
  const startPlacement = useProbeStore((s) => s.startPlacement);
  const setSelectedChannel = useProbeStore((s) => s.setSelectedChannel);

  const channelSamples = useSimulationStore((s) => s.channelSamples);
  const simTime = useSimulationStore((s) => s.simTime);
  const samplingRate = useSimulationStore((s) => s.samplingRate);
  const status = useSimulationStore((s) => s.status);
  const topology = useSimulationStore((s) => s.topology);
  const circuitDoc = useCircuitStore((s) => s.doc);

  const [hoverT, setHoverT] = useState<number | null>(null);
  const [hoverXPct, setHoverXPct] = useState<number>(0);
  const [cursorA, setCursorA] = useState<number | null>(null);
  const [cursorB, setCursorB] = useState<number | null>(null);
  const [showStats, setShowStats] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'channels' | 'trigger'>('channels');
  const [canvasPx, setCanvasPx] = useState({ w: 0, h: 0 });

  const liveRef = useRef({ hoverT, cursorA, cursorB });
  liveRef.current = { hoverT, cursorA, cursorB };
  const dragTrig = useRef(false);

  // A channel only draws when its probe target still resolves
  // against the CURRENT circuit. Stale probes (nodes/branches
  // deleted by later edits) would otherwise read a silent flat
  // zero — indistinguishable from "no waveform".
  const targetStates = useMemo(() => {
    const m = new Map<ChannelId, ReturnType<typeof channelTargetState>>();
    for (const ch of channels) m.set(ch.id, channelTargetState(ch, topology, circuitDoc));
    return m;
  }, [channels, topology, circuitDoc]);

  const enabledChannels = useMemo(
    () =>
      channels.filter(
        (c) =>
          c.enabled && channelHasMeasurement(c) && targetStates.get(c.id) === 'ok',
      ),
    [channels, targetStates],
  );
  const staleChannels = useMemo(
    () =>
      channels.filter(
        (c) => channelHasMeasurement(c) && targetStates.get(c.id) === 'stale',
      ),
    [channels, targetStates],
  );
  const hasChannels = channels.some((c) => channelHasMeasurement(c));
  const isRunning = status === 'running';
  const sampleCount = useMemo(
    () => Math.max(0, ...CHANNEL_IDS.map((id) => channelSamples[id]?.length ?? 0)),
    [channelSamples],
  );
  const hasSignal = sampleCount > 1;

  const win = useMemo(
    () => computeWindow(enabledChannels, channelSamples, trigger, timeDiv),
    [enabledChannels, channelSamples, trigger, timeDiv],
  );

  const scales = useMemo(() => {
    const m = new Map<ChannelId, number>();
    for (const ch of enabledChannels) {
      const vs = visibleSamples(channelSamples[ch.id], win.windowStart, win.windowEnd, ch.coupling);
      m.set(ch.id, effectiveScale(ch, vs));
    }
    return m;
  }, [enabledChannels, channelSamples, win]);

  const stats = useMemo(() => {
    const out = new Map<ChannelId, ReturnType<typeof computeStats>>();
    for (const ch of enabledChannels) out.set(ch.id, computeStats(channelSamples[ch.id]));
    return out;
  }, [enabledChannels, channelSamples]);

  /* ---------- responsive canvas sizing ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      setCanvasPx({ w: canvas.width, h: canvas.height });
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    window.addEventListener('resize', resize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  /* ---------- waveform rendering (single rAF loop, ref-driven) ---------- */
  const renderState = useRef({ channels, channelSamples, trigger, timeDiv, targetStates });
  renderState.current = { channels, channelSamples, trigger, timeDiv, targetStates };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animId = 0;

    const draw = () => {
      const st = renderState.current;
      const live = liveRef.current;
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      if (W < 10 || H < 10) {
        animId = requestAnimationFrame(draw);
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const isLight = document.documentElement.dataset.theme === 'light';

      // background: deep gradient + vignette
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      if (isLight) {
        bg.addColorStop(0, '#0b1220');
        bg.addColorStop(1, '#060a12');
      } else {
        bg.addColorStop(0, '#0a111c');
        bg.addColorStop(0.6, '#070b12');
        bg.addColorStop(1, '#05080d');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const enabled = st.channels.filter(
        (c) =>
          c.enabled &&
          channelHasMeasurement(c) &&
          st.targetStates.get(c.id) === 'ok',
      );
      const w = computeWindow(enabled, st.channelSamples, st.trigger, st.timeDiv);
      const mapX = (tt: number) => ((tt - w.windowStart) / (GRID_X * st.timeDiv)) * W;

      // grid: minor (5 per div) + major
      const minorX = W / GRID_X / 5;
      const minorY = H / GRID_Y / 5;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(120,160,200,0.07)';
      ctx.beginPath();
      for (let x = minorX; x < W; x += minorX) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, H);
      }
      for (let y = minorY; y < H; y += minorY) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(W, Math.round(y) + 0.5);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(120,165,205,0.20)';
      ctx.beginPath();
      for (let i = 0; i <= GRID_X; i++) {
        const x = Math.round((W / GRID_X) * i) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      }
      for (let i = 0; i <= GRID_Y; i++) {
        const y = Math.round((H / GRID_Y) * i) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();

      // center axes
      ctx.strokeStyle = 'rgba(140,190,230,0.38)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(H / 2) + 0.5);
      ctx.lineTo(W, Math.round(H / 2) + 0.5);
      ctx.moveTo(Math.round(W / 2) + 0.5, 0);
      ctx.lineTo(Math.round(W / 2) + 0.5, H);
      ctx.stroke();

      // per-channel scales
      const eff = new Map<ChannelId, number>();
      const vis = new Map<ChannelId, { t: number; value: number }[]>();
      for (const ch of enabled) {
        const vs = visibleSamples(st.channelSamples[ch.id], w.windowStart, w.windowEnd, ch.coupling);
        vis.set(ch.id, vs);
        eff.set(ch.id, effectiveScale(ch, vs));
      }
      const mapY = (ch: OscilloscopeChannel, v: number) => {
        const scale = eff.get(ch.id) ?? 1;
        const zero = H / 2 - ch.position * (H / GRID_Y);
        return zero - (v / scale) * (H / GRID_Y);
      };

      // trigger level line (draggable — see pointer handlers)
      const trigCh = st.channels.find((c) => c.id === st.trigger.source);
      if (trigCh && w.tTrig != null) {
        const y = mapY(trigCh, st.trigger.level);
        if (y > -20 && y < H + 20) {
          ctx.save();
          ctx.strokeStyle = trigCh.color;
          ctx.globalAlpha = 0.85;
          ctx.setLineDash([6, 5]);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          // level handle on the right edge
          ctx.fillStyle = trigCh.color;
          ctx.beginPath();
          ctx.moveTo(W - 2, y);
          ctx.lineTo(W - 12, y - 6);
          ctx.lineTo(W - 12, y + 6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        // trigger point marker at top
        const x = mapX(w.tTrig);
        if (x >= 0 && x <= W) {
          ctx.fillStyle = trigCh.color;
          ctx.beginPath();
          ctx.moveTo(x, 2);
          ctx.lineTo(x - 6, 11);
          ctx.lineTo(x + 6, 11);
          ctx.closePath();
          ctx.fill();
        }
      }

      // waveforms with soft glow
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const ch of enabled) {
        const vs = vis.get(ch.id);
        if (!vs || vs.length < 2) continue;
        ctx.save();
        ctx.strokeStyle = ch.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = ch.color;
        ctx.shadowBlur = 7;
        ctx.beginPath();
        let started = false;
        for (const s of vs) {
          const x = mapX(s.t);
          const y = mapY(ch, s.value);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // hover crosshair + dots
      const ht = live.hoverT;
      if (ht != null && ht >= w.windowStart && ht <= w.windowEnd) {
        const x = mapX(ht);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
        for (const ch of enabled) {
          const v = valueAt(st.channelSamples[ch.id], ht);
          if (v == null) continue;
          // AC-coupling aware dot: recompute mean-shift like visibleSamples
          const y = mapY(ch, ch.coupling === 'ac' ? v - acMean(st.channelSamples[ch.id], w) : v);
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x, y, 3.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = ch.color;
          ctx.beginPath();
          ctx.arc(x, y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // cursors A / B
      const curs: [number | null, string, string][] = [
        [live.cursorA, '#f1f5f9', 'A'],
        [live.cursorB, '#f0abfc', 'B'],
      ];
      for (const [cur, color, tag] of curs) {
        if (cur == null || cur < w.windowStart || cur > w.windowEnd) continue;
        const x = Math.round(mapX(cur)) + 0.5;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(tag, x + 5, 13);
      }

      // time axis labels
      ctx.fillStyle = 'rgba(160,190,215,0.85)';
      ctx.font = '10px ui-monospace, JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      const step = W < 520 ? 2 : 1;
      for (let i = 0; i <= GRID_X; i += step) {
        const tt = w.windowStart + i * st.timeDiv;
        const x = (W / GRID_X) * i;
        const cx = Math.min(W - 24, Math.max(24, x));
        ctx.fillText(formatTime(tt), cx, H - 6);
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  function acMean(samples: readonly ChannelSample[], w: WindowInfo): number {
    let sum = 0;
    let n = 0;
    for (const s of samples) {
      if (s.t < w.windowStart) continue;
      if (s.t > w.windowEnd) break;
      sum += s.value;
      n++;
    }
    return n > 0 ? sum / n : 0;
  }

  /* ---------- pointer interactions ---------- */

  const windowFromClientX = useCallback(
    (clientX: number): { t: number; pct: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      if (frac < 0 || frac > 1) return null;
      return { t: win.windowStart + frac * GRID_X * timeDiv, pct: frac * 100 };
    },
    [win, timeDiv],
  );

  const trigYForClientY = useCallback(
    (clientY: number): number | null => {
      const canvas = canvasRef.current;
      const trigCh = channels.find((c) => c.id === trigger.source);
      if (!canvas || !trigCh) return null;
      const rect = canvas.getBoundingClientRect();
      const scale = scales.get(trigCh.id);
      if (!scale) return null;
      const zero = rect.height / 2 - trigCh.position * (rect.height / GRID_Y);
      const y = clientY - rect.top;
      return zero - ((y - zero) / (rect.height / GRID_Y)) * 0 + (zero - y) / (rect.height / GRID_Y) * scale;
    },
    [channels, trigger.source, scales],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // start trigger-level drag when grabbing near the dashed line
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const trigCh = channels.find((c) => c.id === trigger.source);
      const scale = trigCh ? scales.get(trigCh.id) : undefined;
      if (trigCh && scale) {
        const zero = rect.height / 2 - trigCh.position * (rect.height / GRID_Y);
        const yTrig = zero - (trigger.level / scale) * (rect.height / GRID_Y);
        if (Math.abs(e.clientY - rect.top - yTrig) < 12) {
          dragTrig.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          e.preventDefault();
          return;
        }
      }
    }
    void trigYForClientY;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragTrig.current) {
      const canvas = canvasRef.current;
      const trigCh = channels.find((c) => c.id === trigger.source);
      const scale = trigCh ? scales.get(trigCh.id) : undefined;
      if (canvas && trigCh && scale) {
        const rect = canvas.getBoundingClientRect();
        const zero = rect.height / 2 - trigCh.position * (rect.height / GRID_Y);
        const y = e.clientY - rect.top;
        const v = ((zero - y) / (rect.height / GRID_Y)) * scale;
        const rounded = Math.round(v * 1000) / 1000;
        setTrigger({ level: rounded });
      }
      return;
    }
    const pos = windowFromClientX(e.clientX);
    if (pos) {
      setHoverT(pos.t);
      setHoverXPct(pos.pct);
    } else setHoverT(null);
  };

  const endDrag = () => {
    dragTrig.current = false;
  };

  const onCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragTrig.current) return;
    if (hoverT == null) return;
    if (e.shiftKey) setCursorB(hoverT);
    else setCursorA(hoverT);
  };

  // wheel: zoom the time base (no page scroll hijack — panel-local)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!hasChannels) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      setTimeDiv(stepTimeDiv(timeDiv, dir as 1 | -1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [hasChannels, timeDiv, setTimeDiv]);

  const cursorValues = (cur: number | null) => {
    if (cur == null) return null;
    return enabledChannels.map((ch) => ({ ch, v: valueAt(channelSamples[ch.id], cur) }));
  };
  const readA = cursorValues(cursorA);
  const readB = cursorValues(cursorB);
  const dT = cursorA != null && cursorB != null ? cursorB - cursorA : null;
  const dFreq = dT != null && Math.abs(dT) > 1e-12 ? 1 / Math.abs(dT) : null;

  const nodeLabel = (nodeId: string | null): string => {
    if (!nodeId || !topology) return '—';
    const n = topology.nodes.get(nodeId);
    return n ? `(${Math.round(n.x)}, ${Math.round(n.y)})` : '—';
  };

  const describeChannel = (ch: OscilloscopeChannel): string => {
    if (ch.type === 'voltage') {
      const plus = nodeLabel(ch.positiveNodeId);
      const minus = ch.useGroundRef ? 'GND' : nodeLabel(ch.negativeNodeId);
      return `${plus} → ${minus}`;
    }
    if (ch.branchKind === 'wire') return 'wire';
    const comp = circuitDoc.components.find((c) => c.id === ch.branchId);
    return comp ? comp.label : '—';
  };

  const autoFit = () => {
    // reset vertical scales to auto + fit time window to the buffer span
    for (const ch of enabledChannels) updateChannel(ch.id, { scale: 0, position: 0 });
    let span = 0;
    for (const ch of enabledChannels) {
      const buf = channelSamples[ch.id];
      if (buf.length > 1) span = Math.max(span, buf[buf.length - 1].t - buf[0].t);
    }
    if (span > 0) {
      const target = span / GRID_X;
      let best = TIME_DIV_OPTIONS[0];
      for (const o of TIME_DIV_OPTIONS) {
        if (Math.abs(o - target) < Math.abs(best - target)) best = o;
      }
      setTimeDiv(best);
    }
  };

  const timeIndex = Math.max(0, TIME_DIV_OPTIONS.indexOf(timeDiv));

  return (
    <div className="oscilloscope-panel scope-pro scope-redesign">
      {/* ===== toolbar ===== */}
      <div className="scope-toolbar">
        <div className="scope-toolbar-group">
          <button
            className={`scope-run-btn ${isRunning ? 'is-running' : ''}`}
            onClick={() => {
              const s = useSimulationStore.getState();
              if (isRunning) s.pause();
              else s.start();
            }}
            title={isRunning ? t('sim.pause') : t('sim.run')}
          >
            <span className="scope-run-dot" />
            {isRunning ? `⏸ ${t('sim.pause') || 'Pause'}` : `▶ ${t('sim.run') || 'Run'}`}
          </button>
          <button
            className="scope-tool-btn"
            onClick={() => useSimulationStore.getState().reset()}
            title={t('sim.reset')}
          >
            ↺ <span className="scope-tool-label">{t('sim.reset') || 'Reset'}</span>
          </button>
          <button
            className="scope-tool-btn"
            onClick={() => {
              useSimulationStore.getState().clearChannelSamples();
              setCursorA(null);
              setCursorB(null);
            }}
            title={t('osc.clear') || 'Clear'}
          >
            ✕ <span className="scope-tool-label">{t('osc.clear') || 'Clear'}</span>
          </button>
        </div>

        <div className="scope-toolbar-group scope-timebase">
          <span className="scope-group-caption">{t('osc.timeBase') || 'Time'}</span>
          <div className="scope-stepper">
            <button
              className="scope-step-btn"
              onClick={() => setTimeDiv(stepTimeDiv(timeDiv, -1))}
              disabled={timeIndex <= 0}
              title="−"
              aria-label="faster sweep"
            >
              −
            </button>
            <select
              value={timeDiv}
              onChange={(e) => setTimeDiv(Number(e.target.value))}
              className="scope-step-value"
              title={t('osc.timeBase') || 'Time/div'}
            >
              {TIME_DIV_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {formatTime(v)}/div
                </option>
              ))}
            </select>
            <button
              className="scope-step-btn"
              onClick={() => setTimeDiv(stepTimeDiv(timeDiv, 1))}
              disabled={timeIndex >= TIME_DIV_OPTIONS.length - 1}
              title="+"
              aria-label="slower sweep"
            >
              +
            </button>
          </div>
          <button className="scope-tool-btn" onClick={autoFit} title={t('osc.autoScale') || 'Auto fit'}>
            ⤢ <span className="scope-tool-label">{t('osc.autoScale') || 'Fit'}</span>
          </button>
        </div>

        <div className="scope-toolbar-group">
          <button
            className="scope-tool-btn scope-add-v"
            onClick={() => startPlacement('voltage')}
            title={t('probe.voltageProbe') || 'Voltage probe'}
          >
            ＋V <span className="scope-tool-label">{t('probe.voltageProbe') || 'Voltage'}</span>
          </button>
          <button
            className="scope-tool-btn scope-add-a"
            onClick={() => startPlacement('current')}
            title={t('probe.currentProbe') || 'Current probe'}
          >
            ＋A <span className="scope-tool-label">{t('probe.currentProbe') || 'Current'}</span>
          </button>
          <button
            className={`scope-tool-btn ${showStats ? 'is-on' : ''}`}
            onClick={() => setShowStats((v) => !v)}
            title={t('osc.stats') || 'Measurements'}
            aria-pressed={showStats}
          >
            ƒx
          </button>
          {(cursorA != null || cursorB != null) && (
            <button
              className="scope-tool-btn"
              onClick={() => {
                setCursorA(null);
                setCursorB(null);
              }}
              title={t('osc.clearCursors') || 'Clear cursors'}
            >
              ⌖✕
            </button>
          )}
        </div>
      </div>

      {/* ===== body: display + sidebar ===== */}
      <div className="scope-body">
        <div className="scope-main">
          <div
            className="osc-display-container scope-display"
            ref={containerRef}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHoverT(null)}
            onPointerDown={onPointerDown}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={onCanvasClick}
            onDoubleClick={() => {
              setCursorA(null);
              setCursorB(null);
            }}
          >
            <div className="scope-display-inner" ref={wrapRef}>
              <canvas ref={canvasRef} className="osc-canvas" />
            </div>

            {/* status pill */}
            <div className="scope-status-pill" data-running={isRunning} data-signal={hasSignal}>
              <span className="scope-status-dot" />
              {!hasChannels
                ? t('probe.emptyTitle') || 'Oscilloscope'
                : !hasSignal
                  ? t('osc.noSignal') || 'No signal — press Run'
                  : isRunning
                    ? `● LIVE · ${formatTime(timeDiv)}/div · ${sampleCount} ${t('osc.samples') || 'pts'}`
                    : `❚❚ HELD · ${sampleCount} ${t('osc.samples') || 'pts'}`}
            </div>

            {/* scale pills */}
            {enabledChannels.length > 0 && (
              <div className="scope-scale-pills">
                {enabledChannels.map((ch) => (
                  <span key={ch.id} className="scope-scale-pill" style={{ ['--ch-color' as string]: ch.color }}>
                    <i className="scope-scale-dot" />
                    {ch.id} · {formatMag(scales.get(ch.id) ?? 1, ch.type === 'voltage' ? 'V' : 'A')}/div
                  </span>
                ))}
              </div>
            )}

            {/* trigger badge */}
            {hasChannels && win.tTrig == null && trigger.mode !== 'auto' && (
              <div className="scope-trig-warn">⚠ {t('osc.noTrigger') || 'waiting for trigger'}</div>
            )}

            {/* hover tooltip */}
            {hoverT != null && hasSignal && (
              <div className="scope-hover-card" style={{ left: `min(max(${hoverXPct}%, 90px), calc(100% - 130px))` }}>
                <div className="scope-hover-t">t = {formatTime(hoverT)}</div>
                {enabledChannels.map((ch) => {
                  const v = valueAt(channelSamples[ch.id], hoverT);
                  if (v == null) return null;
                  return (
                    <div key={ch.id} className="scope-hover-row">
                      <i style={{ background: ch.color }} />
                      <b>{ch.id}</b>
                      <span>{formatMag(v, ch.type === 'voltage' ? 'V' : 'A')}</span>
                    </div>
                  );
                })}
                <div className="scope-hover-hint">
                  {t('osc.hint') || 'Click: A · Shift+click: B · Double-click: clear'}
                </div>
              </div>
            )}

            {/* cursor delta bar */}
            {(cursorA != null || cursorB != null) && (
              <div className="scope-delta-bar">
                {cursorA != null && <span className="scope-delta-chip chip-a">A {formatTime(cursorA)}</span>}
                {cursorB != null && <span className="scope-delta-chip chip-b">B {formatTime(cursorB)}</span>}
                {dT != null && <span className="scope-delta-chip">ΔT {formatTime(dT)}</span>}
                {dFreq != null && <span className="scope-delta-chip">f {formatMag(dFreq, 'Hz')}</span>}
                {readA && readB && dT != null &&
                  readA.map((r, i) => {
                    const o = readB[i];
                    if (!o || o.v == null || r.v == null) return null;
                    return (
                      <span key={r.ch.id} className="scope-delta-chip" style={{ color: r.ch.color }}>
                        Δ{r.ch.id} {formatMag(o.v - r.v, r.ch.type === 'voltage' ? 'V' : 'A')}
                      </span>
                    );
                  })}
              </div>
            )}

            {/* empty / no-signal overlays */}
            {!hasChannels && (
              <div className="scope-overlay">
                <div className="scope-overlay-icon">〰️</div>
                <div className="scope-overlay-title">{t('probe.emptyTitle') || 'Oscilloscope'}</div>
                <div className="scope-overlay-text">
                  {t('probe.emptyText') || 'No measurement configured. Add a probe to measure voltage or current.'}
                </div>
                <div className="scope-overlay-actions">
                  <button className="scope-cta scope-cta-primary" onClick={() => startPlacement('voltage')}>
                    ＋ {t('probe.voltageProbe') || 'Voltage Probe'}
                  </button>
                  <button className="scope-cta" onClick={() => startPlacement('current')}>
                    ＋ {t('probe.currentProbe') || 'Current Probe'}
                  </button>
                </div>
              </div>
            )}
            {hasChannels && !hasSignal && staleChannels.length === 0 && (
              <div className="scope-overlay scope-overlay-slim">
                <div className="scope-overlay-icon">▶</div>
                <div className="scope-overlay-text">{t('osc.noSignal') || 'No signal yet — press Run to capture waveforms.'}</div>
                <button
                  className="scope-cta scope-cta-primary"
                  onClick={() => useSimulationStore.getState().start()}
                >
                  ▶ {t('sim.run') || 'Run'}
                </button>
              </div>
            )}
            {staleChannels.length > 0 && (
              <div className="scope-overlay scope-overlay-slim">
                <div className="scope-overlay-icon">⚠</div>
                <div className="scope-overlay-text">
                  {staleChannels.map((c) => c.id).join(', ')}: probe target no
                  longer exists on this circuit (nodes/branches changed).
                  Remove the probe and place it again.
                </div>
                <div className="scope-overlay-actions">
                  {staleChannels.map((c) => (
                    <button
                      key={c.id}
                      className="scope-cta"
                      onClick={() => removeChannel(c.id)}
                    >
                      × {c.id} {(t('probe.remove') || 'Remove')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* measurements strip */}
          {showStats && enabledChannels.length > 0 && (
            <div className="scope-stats-strip">
              {enabledChannels.map((ch) => {
                const st = stats.get(ch.id);
                if (!st) return null;
                const unit = ch.type === 'voltage' ? 'V' : 'A';
                const p = ch.type === 'voltage' ? 'V' : 'I';
                const last = channelSamples[ch.id][channelSamples[ch.id].length - 1]?.value ?? 0;
                return (
                  <div key={ch.id} className="scope-stat-card" style={{ ['--ch-color' as string]: ch.color }}>
                    <div className="scope-stat-head">
                      <span className="scope-stat-ch">{ch.id}</span>
                      <span className="scope-stat-live">{formatMag(last, unit)}</span>
                    </div>
                    <div className="scope-stat-grid">
                      <span>Max <b>{formatMag(st.max, unit)}</b></span>
                      <span>Min <b>{formatMag(st.min, unit)}</b></span>
                      <span>{p}pp <b>{formatMag(st.pp, unit)}</b></span>
                      <span>{p}avg <b>{formatMag(st.avg, unit)}</b></span>
                      <span>{p}rms <b>{formatMag(st.rms, unit)}</b></span>
                      <span>{t('osc.freq') || 'Freq'} <b>{st.frequency != null ? formatMag(st.frequency, 'Hz') : '—'}</b></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== sidebar ===== */}
        <aside className="scope-side">
          <div className="scope-side-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={sidebarTab === 'channels'}
              className={sidebarTab === 'channels' ? 'active' : ''}
              onClick={() => setSidebarTab('channels')}
            >
              {t('osc.channel') || 'Channels'} · {enabledChannels.length}/4
            </button>
            <button
              role="tab"
              aria-selected={sidebarTab === 'trigger'}
              className={sidebarTab === 'trigger' ? 'active' : ''}
              onClick={() => setSidebarTab('trigger')}
            >
              {t('probe.trigger') || 'Trigger'}
            </button>
          </div>

          {sidebarTab === 'channels' ? (
            <div className="scope-channel-list">
              {channels.map((ch) => {
                const active = channelHasMeasurement(ch);
                const stale = active && targetStates.get(ch.id) === 'stale';
                const drawable = active && !stale;
                const scaleOptions = ch.type === 'voltage' ? VOLTAGE_DIV_OPTIONS : CURRENT_DIV_OPTIONS;
                const unit = ch.type === 'voltage' ? 'V' : 'A';
                const expanded = selectedChannelId === ch.id;
                return (
                  <div
                    key={ch.id}
                    className={`scope-card ${ch.enabled && drawable ? 'is-on' : ''} ${expanded ? 'is-expanded' : ''} ${!active ? 'is-empty' : ''} ${stale ? 'is-stale' : ''}`}
                    style={{ ['--ch-color' as string]: ch.color }}
                    onClick={() => {
                      if (!active) return;
                      setSelectedChannel(expanded ? null : ch.id);
                      if (!stale) locateChannel(ch.id);
                    }}
                  >
                    <div className="scope-card-top">
                      <button
                        className="scope-switch"
                        role="switch"
                        aria-checked={ch.enabled}
                        data-on={ch.enabled && drawable}
                        disabled={!drawable}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateChannel(ch.id, { enabled: !ch.enabled });
                        }}
                        title={ch.enabled ? 'mute channel' : 'enable channel'}
                      >
                        <span className="scope-switch-knob" />
                      </button>
                      <span className="scope-card-badge">{ch.id}</span>
                      <span className="scope-card-meta">
                        <b>{ch.type === 'voltage' ? t('probe.voltage') || 'Voltage' : t('probe.current') || 'Current'}</b>
                        <small title={active ? describeChannel(ch) : undefined}>
                          {stale
                            ? '⚠ target removed — re-place probe'
                            : active
                              ? describeChannel(ch)
                              : t('probe.noMeasurement') || 'empty slot'}
                        </small>
                      </span>
                      {drawable && ch.enabled && (
                        <span className="scope-card-live">
                          {formatMag(channelSamples[ch.id][channelSamples[ch.id].length - 1]?.value ?? 0, unit)}
                        </span>
                      )}
                    </div>

                    {drawable && expanded && (
                      <div className="scope-card-settings" onClick={(e) => e.stopPropagation()}>
                        <label className="scope-field">
                          <span>{t('probe.scale') || 'Scale'}</span>
                          <select
                            value={ch.scale}
                            onChange={(e) => updateChannel(ch.id, { scale: Number(e.target.value) })}
                          >
                            <option value={0}>{t('osc.auto') || 'Auto'}</option>
                            {scaleOptions.map((v) => (
                              <option key={v} value={v}>
                                {formatMag(v, unit)}/div
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="scope-field">
                          <span>{t('probe.coupling') || 'Coupling'}</span>
                          <div className="scope-segmented">
                            {(['dc', 'ac'] as const).map((c) => (
                              <button
                                key={c}
                                className={ch.coupling === c ? 'active' : ''}
                                onClick={() => updateChannel(ch.id, { coupling: c })}
                              >
                                {c.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className="scope-field">
                          <span>{t('probe.position') || 'Position'} {ch.position > 0 ? `+${ch.position}` : ch.position} div</span>
                          <input
                            type="range"
                            min={-4}
                            max={4}
                            step={0.5}
                            value={ch.position}
                            onChange={(e) => updateChannel(ch.id, { position: Number(e.target.value) })}
                          />
                        </label>
                        <div className="scope-card-actions">
                          <button
                            onClick={() => locateChannel(ch.id)}
                            title={t('probe.locate') || 'Locate probe on the circuit'}
                          >
                            ◎ {t('probe.locate') || 'Locate'}
                          </button>
                          <button
                            className="danger"
                            onClick={() => removeChannel(ch.id)}
                            title={t('probe.remove') || 'Remove probe'}
                          >
                            × {t('probe.remove') || 'Remove'}
                          </button>
                        </div>
                      </div>
                    )}

                    {!active && (
                      <button
                        className="scope-card-add"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedChannel(ch.id);
                          startPlacement(ch.id === 'CH3' || ch.id === 'CH4' ? 'current' : 'voltage');
                        }}
                      >
                        ＋ {t('osc.addProbe') || 'Click to attach a probe'}
                      </button>
                    )}
                  </div>
                );
              })}
              <p className="scope-side-hint">
                {t('osc.dragLevel') || 'Tip: drag the dashed trigger line on the screen to set its level.'}
              </p>
            </div>
          ) : (
            <div className="scope-trigger-card">
              <div className="scope-field">
                <span>{t('osc.source') || 'Source'}</span>
                <div className="scope-source-row">
                  {CHANNEL_IDS.map((id) => (
                    <button
                      key={id}
                      className={`scope-source-btn ${trigger.source === id ? 'active' : ''}`}
                      style={{ ['--ch-color' as string]: CHANNEL_COLORS[id] }}
                      onClick={() => setTrigger({ source: id })}
                    >
                      <i />
                      {id}
                    </button>
                  ))}
                </div>
              </div>
              <div className="scope-field">
                <span>Mode</span>
                <div className="scope-segmented scope-segmented-3">
                  {(['auto', 'normal', 'single'] as const).map((m) => (
                    <button
                      key={m}
                      className={trigger.mode === m ? 'active' : ''}
                      onClick={() => setTrigger({ mode: m })}
                    >
                      {m === 'auto' ? t('osc.auto') || 'Auto' : m === 'normal' ? t('osc.normal') || 'Normal' : t('osc.single') || 'Single'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="scope-field">
                <span>Edge</span>
                <div className="scope-segmented">
                  <button
                    className={trigger.edge === 'rising' ? 'active' : ''}
                    onClick={() => setTrigger({ edge: 'rising' })}
                  >
                    ↑ {t('probe.rising') || 'Rising'}
                  </button>
                  <button
                    className={trigger.edge === 'falling' ? 'active' : ''}
                    onClick={() => setTrigger({ edge: 'falling' })}
                  >
                    ↓ {t('probe.falling') || 'Falling'}
                  </button>
                </div>
              </div>
              <div className="scope-field">
                <span>{t('probe.triggerLevel') || 'Level'}</span>
                <div className="scope-level-row">
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.1}
                    value={Math.max(-12, Math.min(12, trigger.level))}
                    onChange={(e) => setTrigger({ level: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    step={0.1}
                    value={trigger.level}
                    onChange={(e) => setTrigger({ level: Number(e.target.value) })}
                    aria-label={t('probe.triggerLevel') || 'Trigger level'}
                  />
                </div>
              </div>
            </div>
          )}

          {/* dev-only acquisition diagnostics (never in production) */}
          {import.meta.env.DEV && (
            <details className="scope-debug">
              <summary>OSCILLOSCOPE DEBUG</summary>
              <div className="scope-debug-grid">
                <span>simTime</span><b>{formatTime(simTime)}</b>
                <span>sampleRate</span><b>{samplingRate} S/s</b>
                <span>canvas</span><b>{canvasPx.w}×{canvasPx.h}px</b>
                <span>trigger found</span><b>{win.tTrig != null ? `YES @ ${formatTime(win.tTrig)}` : 'NO'}</b>
                <span>window</span><b>{formatTime(win.windowStart)} → {formatTime(win.windowEnd)}</b>
                {enabledChannels.map((ch) => {
                  const buf = channelSamples[ch.id];
                  const vs = visibleSamples(buf, win.windowStart, win.windowEnd, ch.coupling);
                  const st = stats.get(ch.id);
                  const bad = buf.filter((s) => !Number.isFinite(s.t) || !Number.isFinite(s.value)).length;
                  return (
                    <span key={ch.id} className="scope-debug-ch">
                      {ch.id} {ch.type} src={describeChannel(ch)} | samples={buf.length} visible={vs.length} bad={bad} | min={st ? formatMag(st.min, ch.type === 'voltage' ? 'V' : 'A') : '—'} max={st ? formatMag(st.max, ch.type === 'voltage' ? 'V' : 'A') : '—'} rms={st ? formatMag(st.rms, ch.type === 'voltage' ? 'V' : 'A') : '—'}
                    </span>
                  );
                })}
                {staleChannels.length > 0 && (
                  <span className="scope-debug-ch">STALE: {staleChannels.map((c) => c.id).join(', ')}</span>
                )}
              </div>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
