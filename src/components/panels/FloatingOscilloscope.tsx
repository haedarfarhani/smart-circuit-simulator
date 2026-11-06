import { useState, useRef, useEffect } from 'react';
import { useUiStore } from '../../store/uiStore';
import { useSimulationStore } from '../../store/simulationStore';
import { useProbeStore, channelHasMeasurement } from '../../store/probeStore';
import { makeT } from '../../i18n';
import { Oscilloscope, formatTime } from './Oscilloscope';

export function FloatingOscilloscope() {
  const locale = useUiStore((s) => s.locale);
  const t = makeT(locale);

  const isOpen = useUiStore((s) => s.scopeFloatingOpen);
  const isMinimized = useUiStore((s) => s.scopeFloatingMinimized);
  const isFullscreen = useUiStore((s) => s.scopeFullscreen);
  const setOpen = useUiStore((s) => s.setScopeFloatingOpen);
  const setMinimized = useUiStore((s) => s.setScopeFloatingMinimized);
  const setFullscreen = useUiStore((s) => s.setScopeFullscreen);
  const breakpoint = useUiStore((s) => s.breakpoint);

  const status = useSimulationStore((s) => s.status);
  const isRunning = status === 'running';
  const timeDiv = useProbeStore((s) => s.timeDiv);
  const channels = useProbeStore((s) => s.channels);
  const activeChannels = channels.filter((c) => c.enabled && channelHasMeasurement(c));

  // Position state (persisted in session)
  const isCompact = breakpoint === 'mobile' || breakpoint === 'tablet';
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 40, y: 60 };
    const w = window.innerWidth;
    const defaultX = Math.max(20, Math.round((w - 920) / 2));
    return { x: defaultX, y: 55 };
  });

  const dragRef = useRef<{
    startX: number;
    startY: number;
    posX: number;
    posY: number;
  } | null>(null);

  // Keep window in bounds on window resize
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => {
        const maxX = Math.max(10, window.innerWidth - 320);
        const maxY = Math.max(10, window.innerHeight - 150);
        return {
          x: Math.max(10, Math.min(maxX, prev.x)),
          y: Math.max(10, Math.min(maxY, prev.y)),
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isFullscreen || isCompact) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, select, input, a, .scope-window-ctrl')) return;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: pos.x,
      posY: pos.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const maxX = Math.max(10, window.innerWidth - 320);
    const maxY = Math.max(10, window.innerHeight - 120);

    setPos({
      x: Math.max(10, Math.min(maxX, dragRef.current.posX + dx)),
      y: Math.max(10, Math.min(maxY, dragRef.current.posY + dy)),
    });
  };

  const onDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // pointer may already be released
      }
    }
  };

  if (!isOpen) return null;

  // Minimized floating pill HUD
  if (isMinimized) {
    return (
      <div
        className="scope-mini-widget"
        role="region"
        aria-label="Oscilloscope minimized widget"
      >
        <button
          type="button"
          className="scope-mini-body"
          onClick={() => setMinimized(false)}
          title="Click to expand Oscilloscope"
        >
          <span className={`scope-mini-led ${isRunning ? 'is-live' : ''}`} />
          <span className="scope-mini-title">∿ DSO-4040</span>
          <span className="scope-mini-info">
            {formatTime(timeDiv)}/div · {activeChannels.length} CH
          </span>
          <span className="scope-mini-expand">⤢</span>
        </button>
        <button
          type="button"
          className="scope-mini-close"
          onClick={() => setOpen(false)}
          title={t('dialog.close') || 'Close'}
          aria-label={t('dialog.close') || 'Close'}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div
      className={`floating-scope-window ${isFullscreen ? 'is-fullscreen' : ''} ${isCompact ? 'is-compact' : ''}`}
      style={
        isFullscreen || isCompact
          ? undefined
          : {
              transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
            }
      }
      role="dialog"
      aria-label="Digital Storage Oscilloscope"
    >
      {/* ===== Instrument Chassis Title Bar / Drag Handle ===== */}
      <div
        className="scope-window-header"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onDoubleClick={() => !isCompact && setFullscreen(!isFullscreen)}
      >
        <div className="scope-window-brand">
          <div className="scope-hardware-led-group">
            <span
              className={`scope-hw-led led-power ${isRunning ? 'is-active' : ''}`}
              title={isRunning ? 'Acquisition LIVE' : 'Acquisition HELD'}
            />
            <span
              className={`scope-hw-led led-trig ${activeChannels.length > 0 ? 'is-active' : ''}`}
              title="Trigger System Armed"
            />
          </div>
          <div className="scope-brand-titles">
            <span className="scope-brand-name">
              <span className="scope-sine-glyph">∿</span> DSO-4040 LAB PRO
            </span>
            <span className="scope-brand-sub">
              4-CHANNEL DIGITAL STORAGE OSCILLOSCOPE
            </span>
          </div>
        </div>

        {/* Window action controls */}
        <div className="scope-window-ctrls">
          <button
            type="button"
            className="scope-window-ctrl"
            onClick={() => setMinimized(true)}
            title="Minimize to widget"
            aria-label="Minimize"
          >
            —
          </button>
          {!isCompact && (
            <button
              type="button"
              className="scope-window-ctrl"
              onClick={() => setFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Restore window size' : 'Maximize window'}
              aria-label={isFullscreen ? 'Restore window size' : 'Maximize window'}
            >
              {isFullscreen ? '⤡' : '⤢'}
            </button>
          )}
          <button
            type="button"
            className="scope-window-ctrl ctrl-close"
            onClick={() => {
              setOpen(false);
              setFullscreen(false);
            }}
            title={t('dialog.close') || 'Close'}
            aria-label={t('dialog.close') || 'Close'}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ===== Real Oscilloscope Benchtop Instrument Body ===== */}
      <div className="scope-window-body">
        <Oscilloscope />
      </div>
    </div>
  );
}
