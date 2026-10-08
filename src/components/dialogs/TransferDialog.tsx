import { useEffect, useRef, useState, type ReactNode } from 'react';
import { makeT } from '../../i18n';
import { useCircuitStore } from '../../store/circuitStore';
import { useUiStore } from '../../store/uiStore';
import { validateDoc } from '../../core/validate';

function DialogShell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="close-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function TransferDialog({ mode }: { mode: 'import' | 'export' }) {
  const t = makeT(useUiStore((s) => s.locale));
  const doc = useCircuitStore((s) => s.doc);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => useUiStore.getState().setDialog(null);

  const json = mode === 'export' ? JSON.stringify(doc, null, 2) : text;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      // clipboard API may be unavailable — select the text as a fallback
      const ta = document.querySelector<HTMLTextAreaElement>('.dialog textarea');
      ta?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const download = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'circuit.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyImport = () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setError(t('dialog.invalidJson').replace('{msg}', (e as Error).message));
      return;
    }
    const result = validateDoc(parsed);
    if (!result.ok || !result.doc) {
      setError(t('dialog.invalidJson').replace('{msg}', result.error ?? 'unknown'));
      return;
    }
    useCircuitStore.getState().setDoc(result.doc);
    useUiStore.getState().clearSelection();
    useUiStore.getState().setStatus('status.ready');
    close();
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
      setError(null);
    };
    reader.readAsText(file);
  };

  if (mode === 'export') {
    return (
      <DialogShell
        title={t('dialog.export')}
        onClose={close}
        footer={
          <>
            <button className="btn" onClick={copy}>
              {copied ? t('dialog.copied') : t('dialog.copy')}
            </button>
            <button className="btn primary" onClick={download}>
              {t('dialog.download')}
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{t('dialog.exportText')}</p>
        <textarea readOnly value={json} spellCheck={false} />
      </DialogShell>
    );
  }

  return (
    <DialogShell
      title={t('dialog.import')}
      onClose={close}
      footer={
        <>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            {t('dialog.chooseFile')}
          </button>
          <button
            className="btn primary"
            onClick={applyImport}
            disabled={!text.trim()}
          >
            {t('dialog.apply')}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{t('dialog.importText')}</p>
      <textarea
        value={text}
        spellCheck={false}
        placeholder='{ "components": [], "wires": [] }'
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
      />
      {error && <div className="dialog-error">{error}</div>}
    </DialogShell>
  );
}
