import { makeT } from '../../i18n';
import {
  DEFAULT_VIZ_COLORS,
  useUiStore,
  type VizColors,
} from '../../store/uiStore';
import { DialogShell } from './DialogShell';

const FIELDS: { key: keyof VizColors; label: string }[] = [
  { key: 'current', label: 'legend.current' },
  { key: 'vpos', label: 'legend.vpos' },
  { key: 'vneg', label: 'legend.vneg' },
  { key: 'ac', label: 'legend.ac' },
  { key: 'ground', label: 'legend.gnd' },
  { key: 'overload', label: 'legend.overload' },
  { key: 'short', label: 'legend.short' },
  { key: 'inactive', label: 'legend.inactive' },
];

export function SettingsDialog() {
  const t = makeT(useUiStore((s) => s.locale));
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const viz = useUiStore((s) => s.vizColors);
  const setViz = useUiStore((s) => s.setVizColors);
  const close = () => useUiStore.getState().setDialog(null);

  return (
    <DialogShell
      title={t('settings.title')}
      onClose={close}
      footer={
        <>
          <button
            type="button"
            className="btn"
            onClick={() => setViz(DEFAULT_VIZ_COLORS)}
          >
            {t('settings.resetViz')}
          </button>
          <button type="button" className="btn primary" onClick={close}>
            {t('dialog.close')}
          </button>
        </>
      }
    >
      <div className="field">
        <label>{t('settings.theme')}</label>
        <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
          <option value="dark">{t('theme.dark')}</option>
          <option value="light">{t('theme.light')}</option>
          <option value="system">{t('theme.system')}</option>
        </select>
      </div>
      <div className="presets-title">{t('settings.viz')}</div>
      <div className="viz-fields">
        {FIELDS.map((f) => (
          <label key={f.key} className="viz-field">
            <span>{t(f.label)}</span>
            <input
              type="color"
              value={viz[f.key]}
              onChange={(e) => setViz({ [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <p className="settings-note">{t('legend.note')}</p>
    </DialogShell>
  );
}
