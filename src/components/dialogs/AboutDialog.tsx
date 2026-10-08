import { useEffect, useRef, type ReactNode } from 'react';
import { makeT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';

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
  const ref = useRef<HTMLDivElement>(null);

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
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
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

export function AboutDialog() {
  const t = makeT(useUiStore((s) => s.locale));
  const close = () => useUiStore.getState().setDialog(null);

  const rows: [string, string][] = [
    ['V / W', t('key.select') + ' / ' + t('key.wire')],
    ['R', t('key.rotate')],
    ['Del', t('key.delete')],
    ['Ctrl+C', t('key.copy')],
    ['Ctrl+V', t('key.paste')],
    ['Ctrl+D', t('menu.edit.duplicate')],
    ['Ctrl+Z', t('key.undo')],
    ['Ctrl+Shift+Z', t('key.redo')],
    ['Ctrl+A', t('key.selectAll')],
    ['Space + drag', t('key.pan')],
    ['Wheel', t('key.zoom')],
    ['Esc', t('key.escape')],
  ];

  return (
    <DialogShell title={t('dialog.about')} onClose={close}>
      <p style={{ marginTop: 0 }}>{t('dialog.aboutText')}</p>
      <div className="panel-title" style={{ marginInline: 0 }}>
        {t('key.title')}
      </div>
      <table className="kbd-table">
        <tbody>
          {rows.map(([k, desc]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DialogShell>
  );
}
