import { useEffect, type ReactNode } from 'react';

/**
 * Shared modal dialog chrome: overlay click-to-close, Escape capture,
 * header with title + close button, body and optional footer.
 */
export function DialogShell({
  title,
  onClose,
  children,
  footer,
  labelledBy,
  dialogClassName,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
  dialogClassName?: string;
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
      <div
        className={dialogClassName ? `dialog ${dialogClassName}` : 'dialog'}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
      >
        <div className="dialog-head">
          <h2 id={labelledBy}>{title}</h2>
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
