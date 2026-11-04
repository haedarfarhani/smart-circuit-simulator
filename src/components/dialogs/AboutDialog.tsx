import { makeT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { DialogShell } from './DialogShell';

export function AboutDialog() {
  const t = makeT(useUiStore((s) => s.locale));
  const close = () => useUiStore.getState().setDialog(null);

  const rows: [string, string][] = [
    ['V / W / H', t('key.select') + ' / ' + t('key.wire') + ' / ' + t('key.hand')],
    ['R', t('key.rotate')],
    ['Shift+R', t('inspector.mirrorBtn')],
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
