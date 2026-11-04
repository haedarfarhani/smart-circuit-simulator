import { useEffect, useRef, useState } from 'react';
import { makeT } from '../../i18n';
import { useSimulationStore } from '../../store/simulationStore';
import { useUiStore } from '../../store/uiStore';

interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

const TOAST_MS = 2800;

function isErrorKey(key: string): boolean {
  return /fail|error|nosolution|invalid/i.test(key);
}

/**
 * Transient notifications. Generic feedback rides the existing
 * `uiStore.statusKey` events; solver failures surface separately when
 * the snapshot flips to invalid. Click a toast to dismiss it early.
 */
export function ToastStack() {
  const t = makeT(useUiStore((s) => s.locale));
  const statusKey = useUiStore((s) => s.statusKey);
  const snapshotValid = useSimulationStore((s) => s.snapshot?.valid);
  const snapshotError = useSimulationStore((s) => s.snapshot?.error);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = (text: string, kind: Toast['kind']) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-2), { id, text, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, TOAST_MS);
  };

  // Generic status messages → toasts (StatusBar keeps showing them too).
  const lastStatus = useRef<string | null>(null);
  useEffect(() => {
    if (statusKey && statusKey !== lastStatus.current) {
      push(t(statusKey), isErrorKey(statusKey) ? 'error' : 'ok');
    }
    lastStatus.current = statusKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey]);

  // Solver failure → error toast, once per transition to invalid.
  const wasValid = useRef(true);
  useEffect(() => {
    const valid = snapshotValid !== false;
    if (wasValid.current && !valid && snapshotError) {
      push(`${t('sim.failed')}: ${snapshotError}`, 'error');
    }
    wasValid.current = valid;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotValid, snapshotError]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className="toast"
          data-kind={toast.kind}
          onClick={() => setToasts((prev) => prev.filter((x) => x.id !== toast.id))}
        >
          {toast.text}
        </button>
      ))}
    </div>
  );
}
