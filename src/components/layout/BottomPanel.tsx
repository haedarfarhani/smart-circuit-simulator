import { useCallback, useRef, useState } from 'react';
import { DEFAULT_BOTTOM_PANEL_HEIGHT, useUiStore } from '../../store/uiStore';
import { makeT } from '../../i18n';
import { Oscilloscope } from '../panels/Oscilloscope';
import { AnalyzerPanel } from '../panels/AnalyzerPanel';
import { SimulationControls } from '../panels/SimulationControls';

export function BottomPanel() {
  const locale = useUiStore((s) => s.locale);
  const t = makeT(locale);
  const open = useUiStore((s) => s.bottomPanelOpen);
  const tab = useUiStore((s) => s.bottomPanelTab);
  const setTab = useUiStore((s) => s.setBottomPanelTab);
  const setOpen = useUiStore((s) => s.setBottomPanelOpen);
  const height = useUiStore((s) => s.bottomPanelHeight);
  const setHeight = useUiStore((s) => s.setBottomPanelHeight);

  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onHandleDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startH: height };
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [height],
  );

  const onHandleMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      // Dragging the handle UP (smaller clientY) grows the panel.
      setHeight(drag.startH + (drag.startY - e.clientY));
    },
    [setHeight],
  );

  const onHandleUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      setDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  if (!open) return null;

  const tabs = [
    { id: 'simulation', label: t('tab.simulation') || 'Simulation' },
    { id: 'oscilloscope', label: t('tab.oscilloscope') || 'Oscilloscope' },
    { id: 'measurements', label: t('tab.measurements') || 'Measurements' }
  ] as const;

  return (
    <div
      className="bottom-panel"
      data-resizing={dragging}
      style={{ height }}
      aria-label={t('bottomPanel.title') || 'Bottom Panel'}
    >
      <div
        className="bottom-panel-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('bottomPanel.resize') || 'Drag to resize'}
        title={t('bottomPanel.resize') || 'Drag to resize · double-click to reset'}
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        onDoubleClick={() => setHeight(DEFAULT_BOTTOM_PANEL_HEIGHT)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') setHeight(height + 24);
          else if (e.key === 'ArrowDown') setHeight(height - 24);
          else return;
          e.preventDefault();
        }}
        tabIndex={0}
      >
        <span className="bottom-panel-resize-grip" />
      </div>
      <div className="bottom-panel-header">
        <div className="bottom-panel-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`tab-btn ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          className="btn close-btn"
          onClick={() => setOpen(false)}
          aria-label={t('dialog.close') || 'Close'}
        >
          ×
        </button>
      </div>
      <div className="bottom-panel-content">
        {tab === 'oscilloscope' && <Oscilloscope />}
        {tab === 'simulation' && (
          <>
            <SimulationControls />
            <AnalyzerPanel />
          </>
        )}
        {tab === 'measurements' && (
          <div className="panel-empty">
            {locale === 'fa'
              ? 'قطعاتی را انتخاب کنید تا اندازه‌گیری‌های بلادرنگ نمایش داده شود'
              : 'Select components to view real-time measurements'}
          </div>
        )}
      </div>
    </div>
  );
}
