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
  TIME_DIV_OPTIONS,
  channelScaleOptions,
  channelSymbol,
  channelTargetState,
  channelUnit,
  computeStats,
  logicDutyCycle,
  logicEdgeCount,
  findTriggerTime,
  stepTimeDiv,
  type ChannelId,
  type ChannelSample,
  type OscilloscopeChannel,
} from '../../models/probe';
import { formatValue } from '../../core/labels';
import { buildTopology } from '../../core/solver';
import { makeT } from '../../i18n';

const GRID_X = 10;
const GRID_Y = 8;

export function formatTime(seconds: number): string {
  return formatValue(seconds, 's');
}

export function formatMag(value: number, unit: string): string {
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
  const options = channelScaleOptions(ch);
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

  // If manual level didn't trigger in auto mode, attempt midpoint edge detection
  if (tTrig == null && trigger.mode === 'auto' && trigBuf.length >= 2) {
    const recent = trigBuf.slice(-1000);
    let minV = Infinity;
    let maxV = -Infinity;
    for (const s of recent) {
      if (s.value < minV) minV = s.value;
      if (s.value > maxV) maxV = s.value;
    }
    if (maxV - minV > 1e-6) {
      const mid = (minV + maxV) / 2;
      tTrig = findTriggerTime(recent, mid, trigger.edge as 'rising' | 'falling');
    }
  }

  const span = GRID_X * timeDiv;
  let windowStart = 0;
  let windowEnd = span;

  if (tTrig != null) {
    // Lock trigger point at 2 divisions (20%) across screen
    windowStart = Math.max(0, tTrig - 2 * timeDiv);
    windowEnd = windowStart + span;
  } else {
    // Untriggered / rolling:
    if (latestT <= span) {
      windowStart = 0;
      windowEnd = span;
    } else {
      windowEnd = latestT;
      windowStart = Math.max(0, windowEnd - span);
    }
  }

  return { latestT, tTrig, windowStart, windowEnd };
}

export function Oscilloscope() {
  const locale = useUiStore((s) => s.locale);
  const scopeFullscreen = useUiStore((s) => s.scopeFullscreen);
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
  // The store topology is null until the first simulation run — derive it
  // from the document so freshly-placed probes never read as stale.
  const resolvedTopology = useMemo(
    () => topology ?? buildTopology(circuitDoc),
    [topology, circuitDoc],
  );

  const [hoverT, setHoverT] = useState<number | null>(null);
  const [hoverXPct, setHoverXPct] = useState<number>(0);
  const [cursorA, setCursorA] = useState<number | null>(null);
  const [cursorB, setCursorB] = useState<number | null>(null);
  const [activeCursor, setActiveCursor] = useState<'A' | 'B'>('A');
  const [showStats, setShowStats] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'channels' | 'trigger' | 'measurements'>('channels');
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
    for (const ch of channels) m.set(ch.id, channelTargetState(ch, resolvedTopology, circuitDoc));
    return m;
  }, [channels, resolvedTopology, circuitDoc]);

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
        if (ch.logic) {
          // Digital channels render as a classic step trace: hold each
          // level until the next sample, then jump vertically.
          let started = false;
          let lastY = 0;
          for (const s of vs) {
            const x = mapX(s.t);
            const y = mapY(ch, s.value);
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, lastY);
              ctx.lineTo(x, y);
            }
            lastY = y;
          }
          ctx.lineTo(mapX(vs[vs.length - 1].t), lastY);
        } else {
          let started = false;
          for (const s of vs) {
            const x = mapX(s.t);
            const y = mapY(ch, s.value);
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else ctx.lineTo(x, y);
          }
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
        const hitDistance = e.pointerType === 'touch' ? 28 : 14;
        if (Math.abs(e.clientY - rect.top - yTrig) < hitDistance) {
          dragTrig.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
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
    const pos = windowFromClientX(e.clientX);
    const tVal = pos ? pos.t : hoverT;
    if (tVal == null) return;
    if (e.shiftKey || activeCursor === 'B') {
      setCursorB(tVal);
      if (!e.shiftKey && cursorA == null) setActiveCursor('A');
    } else {
      setCursorA(tVal);
      if (cursorB == null) setActiveCursor('B');
    }
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
    if (!nodeId || !resolvedTopology) return '—';
    const n = resolvedTopology.nodes.get(nodeId);
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

  const exportCsv = () => {
    const chans = useProbeStore.getState().channels;
    const active = chans.filter((ch) => channelSamples[ch.id]?.length > 0);
    if (active.length === 0) return;

    const len = Math.max(...active.map((ch) => channelSamples[ch.id].length));
    const header = [
      'time_s',
      ...active.map((ch) => `${ch.id}_${ch.type === 'voltage' ? 'V' : 'A'}`),
    ];
    const lines = [header.join(',')];
    for (let i = 0; i < len; i++) {
      const t = channelSamples[active[0].id][i];
      const cells = active.map((ch) => {
        const s = channelSamples[ch.id][i];
        return s ? s.value.toPrecision(9) : '';
      });
      lines.push([t ? t.t.toFixed(9) : '', ...cells].join(','));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oscilloscope-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    useUiStore.getState().setStatus('scope.exported');
  };

  const autoFit = () => {
    // 1. Reset vertical scales to auto + position to 0
    for (const ch of enabledChannels) updateChannel(ch.id, { scale: 0, position: 0 });

    // 2. Auto-set trigger level to 50% midpoint of trigger source
    const trigSt = stats.get(trigger.source);
    if (trigSt && trigSt.pp > 1e-6) {
      setTrigger({ level: Math.round(((trigSt.max + trigSt.min) / 2) * 1000) / 1000 });
    }

    // 3. Timebase auto-fit: prefer displaying 3-4 cycles of detected periodic frequency
    const trigFreq = trigSt?.frequency;
    if (trigFreq && trigFreq > 0) {
      const idealTimeDiv = (3 / trigFreq) / GRID_X;
      let best = TIME_DIV_OPTIONS[0];
      for (const o of TIME_DIV_OPTIONS) {
        if (Math.abs(o - idealTimeDiv) < Math.abs(best - idealTimeDiv)) best = o;
      }
      setTimeDiv(best);
      return;
    }

    // Fallback: fit to active buffer span
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
        {/* Group 1: Acquisition & Data Export (RUN/STOP, Reset, Clear, CSV) */}
        <div className="scope-toolbar-group">
          <button
            className={`scope-run-btn ${isRunning ? 'is-running' : ''}`}
            onClick={() => {
              const s = useSimulationStore.getState();
              if (isRunning) s.pause();
              else s.start();
            }}
            title={isRunning ? t('sim.pause') || 'Pause' : t('sim.run') || 'Run'}
          >
            <span className="scope-run-dot" />
            {isRunning ? (t('sim.pause') || 'Pause') : (t('sim.run') || 'Run')}
          </button>
          <button
            className="scope-tool-btn"
            onClick={() => useSimulationStore.getState().reset()}
            title={t('sim.reset') || 'Reset'}
            aria-label={t('sim.reset') || 'Reset'}
          >
            ↺
          </button>
          <button
            className="scope-tool-btn"
            onClick={() => {
              useSimulationStore.getState().clearChannelSamples();
              setCursorA(null);
              setCursorB(null);
            }}
            title={t('osc.clear') || 'Clear'}
            aria-label={t('osc.clear') || 'Clear'}
          >
            ✕
          </button>
          <button
            className="scope-tool-btn scope-btn-csv"
            onClick={exportCsv}
            title={t('scope.export') || 'Export CSV'}
            aria-label={t('scope.export') || 'Export CSV'}
          >
            ⇓ <span className="scope-tool-label">CSV</span>
          </button>
        </div>

        <div className="scope-toolbar-divider" />

        {/* Group 2: Horizontal Timebase */}
        <div className="scope-toolbar-group scope-timebase">
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
          <button
            className="scope-tool-btn scope-btn-autofit"
            onClick={autoFit}
            title={t('osc.autoScale') || 'Auto fit'}
            aria-label={t('osc.autoScale') || 'Auto fit'}
          >
            ⤢ <span className="scope-tool-label">{t('osc.autoScale') || 'Auto'}</span>
          </button>
        </div>

        <div className="scope-toolbar-divider" />

        {/* Group 3: Probes Quick Attach */}
        <div className="scope-toolbar-group">
          <button
            className="scope-tool-btn scope-add-v"
            onClick={() => startPlacement('voltage')}
            title={t('probe.voltageProbe') || 'Voltage probe (+V)'}
          >
            ＋V <span className="scope-tool-label">Volt</span>
          </button>
          <button
            className="scope-tool-btn scope-add-a"
            onClick={() => startPlacement('current')}
            title={t('probe.currentProbe') || 'Current probe (+A)'}
          >
            ＋A <span className="scope-tool-label">Curr</span>
          </button>
        </div>

        <div className="scope-toolbar-divider" />

        {/* Group 4: Analysis & Measurements */}
        <div className="scope-toolbar-group">
          <button
            className={`scope-tool-btn ${showStats ? 'is-on' : ''}`}
            onClick={() => setShowStats((v) => !v)}
            title={t('osc.stats') || 'Measurements'}
            aria-label={t('osc.stats') || 'Measurements'}
            aria-pressed={showStats}
          >
            ƒx <span className="scope-tool-label">{t('osc.stats') || 'Stats'}</span>
          </button>
          <button
            className={`scope-tool-btn ${cursorA != null || cursorB != null ? 'is-on' : ''}`}
            onClick={() => {
              if (cursorA != null || cursorB != null) {
                setCursorA(null);
                setCursorB(null);
              } else {
                setActiveCursor('A');
              }
            }}
            title={t('osc.cursors') || 'Cursors'}
            aria-label="Cursors"
          >
            ⌖ <span className="scope-tool-label">{t('osc.cursors') || 'Cursors'}</span>
          </button>
          <button
            className={`scope-tool-btn ${scopeFullscreen ? 'is-on' : ''}`}
            onClick={() => useUiStore.getState().setScopeFullscreen(!scopeFullscreen)}
            title={t('scope.fullscreen') || 'Fullscreen'}
            aria-label={t('scope.fullscreen') || 'Fullscreen'}
            aria-pressed={scopeFullscreen}
          >
            {scopeFullscreen ? '⤡' : '⤢'}
          </button>
        </div>
      </div>

      {/* ===== body: display + sidebar ===== */}
      <div className="scope-body">
        <div className="scope-main">
          <div
            className="osc-display-container scope-display"
            ref={containerRef}
            style={{ touchAction: 'none' }}
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

            {/* Real oscilloscope left-bezel ground reference markers */}
            <div className="scope-ground-indicators" aria-hidden="true">
              {enabledChannels.map((ch) => {
                const yPct = Math.max(3, Math.min(97, 50 - (ch.position / 4) * 50));
                return (
                  <div
                    key={ch.id}
                    className="scope-ground-tag"
                    style={{
                      top: `${yPct}%`,
                      color: ch.color,
                      ['--ch-color' as string]: ch.color,
                    }}
                    title={`${ch.id} Zero Level (Pos: ${ch.position > 0 ? '+' : ''}${ch.position} div)`}
                  >
                    <span>{ch.id.slice(2)}</span>▶
                  </div>
                );
              })}
            </div>

            {/* Real oscilloscope right-bezel trigger level marker */}
            {(() => {
              const trigCh = channels.find((c) => c.id === trigger.source);
              const trigScale = trigCh ? scales.get(trigCh.id) : undefined;
              if (!trigCh || !trigScale) return null;
              const yPct = Math.max(3, Math.min(97, 50 - (trigCh.position / 4) * 50 - ((trigger.level / trigScale) / 4) * 50));
              return (
                <div
                  className="scope-trigger-tag"
                  style={{
                    top: `${yPct}%`,
                    color: trigCh.color,
                    ['--ch-color' as string]: trigCh.color,
                  }}
                  title={`Trigger Level: ${formatMag(trigger.level, channelUnit(trigCh))}`}
                >
                  ◀<span>T</span>
                </div>
              );
            })()}

            {/* Real oscilloscope top-bezel trigger time pointer */}
            <div className="scope-trig-time-marker" title="Trigger Time Center">
              ▼
            </div>

            {/* touch-friendly cursor selector pills */}
            <div className="scope-cursor-pills" role="toolbar" aria-label="Cursor selector">
              <button
                type="button"
                className={`scope-cursor-pill ${activeCursor === 'A' ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveCursor('A');
                }}
                title={t('osc.cursorA') || 'Cursor A'}
                aria-pressed={activeCursor === 'A'}
              >
                ⌖ A{cursorA != null ? ' ●' : ''}
              </button>
              <button
                type="button"
                className={`scope-cursor-pill ${activeCursor === 'B' ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveCursor('B');
                }}
                title={t('osc.cursorB') || 'Cursor B'}
                aria-pressed={activeCursor === 'B'}
              >
                ⌖ B{cursorB != null ? ' ●' : ''}
              </button>
              {(cursorA != null || cursorB != null) && (
                <button
                  type="button"
                  className="scope-cursor-pill is-clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCursorA(null);
                    setCursorB(null);
                  }}
                  title={t('osc.clearCursors') || 'Clear cursors'}
                  aria-label={t('osc.clearCursors') || 'Clear cursors'}
                >
                  ✕
                </button>
              )}
            </div>

            {/* status pill */}
            <div className="scope-status-pill" data-running={isRunning} data-signal={hasSignal}>
              <span className="scope-status-dot" />
              {!hasChannels
                ? t('probe.emptyTitle') || 'Oscilloscope'
                : !hasSignal
                  ? t('osc.noSignal') || 'No signal — press Run'
                  : isRunning
                    ? `● ${t('osc.live') || 'LIVE'} · ${formatTime(timeDiv)}/div · ${sampleCount} ${t('osc.pts') || 'pts'}`
                    : `❚❚ ${t('osc.held') || 'HELD'} · ${sampleCount} ${t('osc.pts') || 'pts'}`}
              {hasChannels && hasSignal && (
                <span className={`scope-trig-chip ${win.tTrig != null ? 'is-trig' : trigger.mode === 'auto' ? 'is-auto' : 'is-wait'}`}>
                  {win.tTrig != null ? "TRIG'D" : trigger.mode === 'auto' ? 'AUTO' : 'WAIT'}
                </span>
              )}
            </div>

            {/* scale pills */}
            {enabledChannels.length > 0 && (
              <div className="scope-scale-pills">
                {enabledChannels.map((ch) => (
                  <span key={ch.id} className="scope-scale-pill" style={{ ['--ch-color' as string]: ch.color }}>
                    <i className="scope-scale-dot" />
                    {ch.id} · {formatMag(scales.get(ch.id) ?? 1, channelUnit(ch))}/div
                  </span>
                ))}
              </div>
            )}

            {/* trigger badge (only in normal/single mode when waiting for trigger) */}
            {hasChannels && hasSignal && win.tTrig == null && trigger.mode !== 'auto' && (
              <div className="scope-trig-warn">⏳ {t('osc.noTrigger') || 'Waiting for trigger'}</div>
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
                      <span>{formatMag(v, channelUnit(ch))}</span>
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
                        Δ{r.ch.id} {formatMag(o.v - r.v, channelUnit(r.ch))}
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
                  {staleChannels.map((c) => c.id).join(', ')}
                  {t('osc.staleProbe')}
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
                const unit = channelUnit(ch);
                const p = channelSymbol(ch);
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
                      {ch.logic && (
                        <>
                          <span>
                            Duty{' '}
                            <b>
                              {logicDutyCycle(channelSamples[ch.id]) != null
                                ? `${(logicDutyCycle(channelSamples[ch.id])! * 100).toFixed(0)}%`
                                : '—'}
                            </b>
                          </span>
                          <span>
                            Edges <b>{logicEdgeCount(channelSamples[ch.id])}</b>
                          </span>
                        </>
                      )}
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
            <button
              role="tab"
              aria-selected={sidebarTab === 'measurements'}
              className={`scope-side-tab-measurements ${sidebarTab === 'measurements' ? 'active' : ''}`}
              onClick={() => setSidebarTab('measurements')}
            >
              {t('osc.stats') || 'Measurements'}
            </button>
          </div>

          {sidebarTab === 'channels' ? (
            <div className="scope-channel-list">
              {channels.map((ch) => {
                const active = channelHasMeasurement(ch);
                const stale = active && targetStates.get(ch.id) === 'stale';
                const drawable = active && !stale;
                const scaleOptions = channelScaleOptions(ch);
                const unit = channelUnit(ch);
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
                        aria-label={`${ch.id} ${ch.enabled ? 'mute' : 'enable'}`}
                      >
                        <span className="scope-switch-knob" />
                      </button>
                      <span className="scope-card-badge">{ch.id}</span>
                      <span className="scope-card-meta">
                        <b>
                          {ch.quantity === 'power'
                            ? t('probe.power') || 'Power'
                            : ch.quantity === 'temperature'
                              ? t('probe.temperature') || 'Temperature'
                              : ch.type === 'voltage'
                                ? t('probe.voltage') || 'Voltage'
                                : t('probe.current') || 'Current'}
                        </b>
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
                      <div className="scope-card-empty-row compact">
                        <button
                          type="button"
                          className="scope-card-add-btn is-v"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChannel(ch.id);
                            startPlacement('voltage');
                          }}
                          title={t('probe.voltageProbe') || 'Voltage probe'}
                        >
                          ＋V {t('probe.voltage') || 'Voltage'}
                        </button>
                        <button
                          type="button"
                          className="scope-card-add-btn is-a"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChannel(ch.id);
                            startPlacement('current');
                          }}
                          title={t('probe.currentProbe') || 'Current probe'}
                        >
                          ＋A {t('probe.current') || 'Current'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="scope-side-hint">
                {t('osc.dragLevel') || 'Tip: drag the dashed trigger line on the screen to set its level.'}
              </p>
            </div>
          ) : sidebarTab === 'trigger' ? (
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
          ) : (
            <div className="scope-side-measurements">
              {enabledChannels.length === 0 ? (
                <div className="scope-side-empty-stats">
                  <p>{t('probe.noMeasurement') || 'No active channels to measure.'}</p>
                </div>
              ) : (
                enabledChannels.map((ch) => {
                  const st = stats.get(ch.id);
                  if (!st) return null;
                  const unit = channelUnit(ch);
                  const p = channelSymbol(ch);
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
                        {ch.logic && (
                          <>
                            <span>
                              Duty{' '}
                              <b>
                                {logicDutyCycle(channelSamples[ch.id]) != null
                                  ? `${(logicDutyCycle(channelSamples[ch.id])! * 100).toFixed(0)}%`
                                  : '—'}
                              </b>
                            </span>
                            <span>
                              Edges <b>{logicEdgeCount(channelSamples[ch.id])}</b>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
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
                      {ch.id} {ch.type} src={describeChannel(ch)} | samples={buf.length} visible={vs.length} bad={bad} | min={st ? formatMag(st.min, channelUnit(ch)) : '—'} max={st ? formatMag(st.max, channelUnit(ch)) : '—'} rms={st ? formatMag(st.rms, channelUnit(ch)) : '—'}
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

      {/* ===== Front-Panel BNC Input Bar ===== */}
      <div className="scope-bnc-bar" role="region" aria-label="BNC Channel Inputs">
        <div className="scope-bnc-cluster">
          <span className="scope-bnc-caption">INPUTS · 1MΩ 15pF ≤400Vpk</span>
          <div className="scope-bnc-ports">
            {channels.map((ch) => {
              const active = channelHasMeasurement(ch);
              const stale = active && targetStates.get(ch.id) === 'stale';
              const val = channelSamples[ch.id]?.[channelSamples[ch.id].length - 1]?.value;
              return (
                <div
                  key={ch.id}
                  className={`scope-bnc-jack ${active ? 'is-connected' : 'is-empty'} ${selectedChannelId === ch.id ? 'is-selected' : ''}`}
                  style={{ ['--ch-color' as string]: ch.color }}
                  onClick={() => {
                    setSelectedChannel(ch.id);
                    if (active) {
                      if (!stale) locateChannel(ch.id);
                    } else {
                      startPlacement(ch.id === 'CH3' || ch.id === 'CH4' ? 'current' : 'voltage');
                    }
                  }}
                  title={
                    active
                      ? `${ch.id}: ${describeChannel(ch)} (${val != null ? formatMag(val, channelUnit(ch)) : ''}) — Click to locate`
                      : `${ch.id} Unconnected — Click to attach probe`
                  }
                >
                  <div className="scope-bnc-socket">
                    <div className="scope-bnc-outer-ring" />
                    <div className="scope-bnc-inner-pin" />
                    <div className="scope-bnc-led-halo" />
                  </div>
                  <div className="scope-bnc-meta">
                    <span className="scope-bnc-label">{ch.id}</span>
                    <span className="scope-bnc-val">
                      {active && val != null ? formatMag(val, channelUnit(ch)) : 'OPEN'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="scope-bnc-calib">
          <div className="scope-calib-socket">
            <div className="scope-calib-pin" />
          </div>
          <span className="scope-calib-label">CAL 1kHz 3V</span>
        </div>
      </div>
    </div>
  );
}
