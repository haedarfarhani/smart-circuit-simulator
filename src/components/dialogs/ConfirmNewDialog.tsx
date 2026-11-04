import { makeT } from '../../i18n';
import { useCircuitStore } from '../../store/circuitStore';
import { useUiStore } from '../../store/uiStore';
import { DialogShell } from './DialogShell';

/** Confirmation before replacing the working circuit with an empty one. */
export function ConfirmNewDialog() {
  const t = makeT(useUiStore((s) => s.locale));
  const close = () => useUiStore.getState().setDialog(null);

  const confirm = () => {
    useCircuitStore.getState().newCircuit();
    useUiStore.getState().clearSelection();
    useUiStore.getState().setWireDraft(null);
    useUiStore.getState().setStatus('status.ready');
    close();
  };

  return (
    <DialogShell
      title={t('dialog.newTitle')}
      onClose={close}
      footer={
        <>
          <button type="button" className="btn" onClick={close}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="btn primary" onClick={confirm}>
            {t('dialog.newConfirm')}
          </button>
        </>
      }
    >
      <p className="confirm-text">{t('dialog.newBody')}</p>
    </DialogShell>
  );
}
