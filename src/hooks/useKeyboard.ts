import { useEffect } from 'react';
import { useCircuitStore } from '../store/circuitStore';
import { useUiStore } from '../store/uiStore';
import {
  copySelection,
  pasteClipboard,
} from '../utils/clipboard';
import { clamp, MAX_ZOOM, MIN_ZOOM } from '../store/uiStore';

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  );
}

/** Global shortcuts for the editor (see Help → Shortcuts). */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ui = useUiStore.getState();
      const store = useCircuitStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      // Space pans regardless of focus (but not while typing)
      if (e.code === 'Space' && !isTypingTarget(e)) {
        e.preventDefault();
        ui.setSpaceHeld(true);
        return;
      }

      if (isTypingTarget(e)) return;

      if (e.key === 'Escape') {
        if (ui.wireDraft) ui.setWireDraft(null);
        else if (ui.dialog) ui.setDialog(null);
        else ui.clearSelection();
        return;
      }

      if (mod) {
        const key = e.key.toLowerCase();
        if (key === 'n') {
          e.preventDefault();
          // New circuit: empty workspace replaces immediately, otherwise confirm.
          if (store.doc.components.length === 0) {
            store.newCircuit();
            ui.clearSelection();
            ui.setWireDraft(null);
            ui.setStatus('status.ready');
          } else {
            ui.setDialog('confirm-new');
          }
          return;
        }
        if (key === 's') {
          e.preventDefault();
          ui.setDialog('transfer-export');
          return;
        }
        if (key === 'o') {
          e.preventDefault();
          ui.setDialog('transfer-import');
          return;
        }
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) store.redo();
          else store.undo();
          ui.setStatus(e.shiftKey ? 'status.redone' : 'status.undone');
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          store.redo();
          ui.setStatus('status.redone');
          return;
        }
        if (key === 'c') {
          e.preventDefault();
          copySelection();
          if (ui.selection.length > 0) ui.setStatus('dialog.copied');
          return;
        }
        if (key === 'v') {
          e.preventDefault();
          pasteClipboard();
          return;
        }
        if (key === 'a') {
          e.preventDefault();
          ui.select([
            ...store.doc.components.map((c) => c.id),
            ...store.doc.wires.map((w) => w.id),
          ]);
          return;
        }
        if (key === 'd') {
          e.preventDefault();
          const ids = store.duplicateComponents(ui.selection);
          if (ids.length) ui.select(ids);
          return;
        }
        if (key === '=' || key === '+') {
          e.preventDefault();
          ui.setView({ zoom: clamp(ui.zoom * 1.25, MIN_ZOOM, MAX_ZOOM) });
          return;
        }
        if (key === '-') {
          e.preventDefault();
          ui.setView({ zoom: clamp(ui.zoom * 0.8, MIN_ZOOM, MAX_ZOOM) });
          return;
        }
        if (key === '0') {
          e.preventDefault();
          ui.setView({ zoom: 1, panX: 0, panY: 0 });
          return;
        }
        return;
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace': {
          if (ui.selection.length > 0) {
            e.preventDefault();
            store.deleteElements(ui.selection);
            ui.clearSelection();
            ui.setStatus('status.deleted');
          }
          break;
        }
        case 'r':
        case 'R': {
          if (ui.selection.some((id) =>
            store.doc.components.some((c) => c.id === id),
          )) {
            e.preventDefault();
            if (e.shiftKey) {
              // Shift+R mirrors the selected components horizontally.
              const ids = ui.selection.filter((id) =>
                store.doc.components.some((c) => c.id === id),
              );
              store.updateComponents(ids, {
                mirrored: !ids.every(
                  (id) =>
                    store.doc.components.find((c) => c.id === id)?.mirrored,
                ),
              });
              ui.setStatus('status.mirrored');
            } else {
              store.rotateComponents(ui.selection);
              ui.setStatus('status.rotated');
            }
          }
          break;
        }
        case 'v':
        case 'V':
          ui.setTool('select');
          break;
        case 'w':
        case 'W':
          ui.setTool('wire');
          break;
        case 'h':
        case 'H':
          ui.setTool('hand');
          break;
        default:
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') useUiStore.getState().setSpaceHeld(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
