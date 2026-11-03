import { useEffect, useState } from 'react';
import { makeT } from '../../i18n';
import { useCircuitStore } from '../../store/circuitStore';
import { useUiStore } from '../../store/uiStore';
import { copySelection } from '../../utils/clipboard';

export function CanvasContextMenu() {
  const t = makeT(useUiStore((s) => s.locale));
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const selection = useUiStore((s) => s.selection);

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const wrap = (e.target as HTMLElement | null)?.closest?.('.canvas-wrap');
      if (!wrap) return;
      e.preventDefault();
      setPos({ x: e.clientX, y: e.clientY });
    };
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('.ctx-menu')) setPos(null);
    };
    window.addEventListener('contextmenu', onCtx);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('mousedown', onDown);
    };
  }, []);

  if (!pos) return null;

  const store = useCircuitStore.getState();
  const ui = useUiStore.getState();
  const hasSel = selection.length > 0;
  const hasComp = selection.some((id) => store.doc.components.some((c) => c.id === id));

  const run = (fn: () => void) => {
    fn();
    setPos(null);
  };

  return (
    <div
      className="ctx-menu"
      role="menu"
      style={{ top: pos.y, left: pos.x }}
    >
      <button role="menuitem" disabled={!hasComp} onClick={() => run(() => {
        store.rotateComponents(selection);
        ui.setStatus('status.rotated');
      })}>
        {t('inspector.rotateBtn')}
      </button>
      <button role="menuitem" disabled={!hasComp} onClick={() => run(() => {
        const ids = store.duplicateComponents(selection);
        if (ids.length) ui.select(ids);
      })}>
        {t('inspector.duplicate')}
      </button>
      <button role="menuitem" disabled={!hasSel} onClick={() => run(() => copySelection())}>
        {t('key.copy')}
      </button>
      <button
        role="menuitem"
        className="danger"
        disabled={!hasSel}
        onClick={() => run(() => {
          store.deleteElements(selection);
          ui.clearSelection();
          ui.setStatus('status.deleted');
        })}
      >
        {t('inspector.delete')}
      </button>
    </div>
  );
}
