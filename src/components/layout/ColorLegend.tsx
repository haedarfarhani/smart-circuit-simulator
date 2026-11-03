import { makeT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';

const ITEMS: { key: string; css: string }[] = [
  { key: 'legend.current', css: '--viz-current' },
  { key: 'legend.vpos', css: '--viz-vpos' },
  { key: 'legend.vneg', css: '--viz-vneg' },
  { key: 'legend.ac', css: '--viz-ac' },
  { key: 'legend.gnd', css: '--viz-gnd' },
  { key: 'legend.overload', css: '--viz-overload' },
  { key: 'legend.short', css: '--viz-short' },
  { key: 'legend.inactive', css: '--viz-inactive' },
];

export function ColorLegend() {
  const t = makeT(useUiStore((s) => s.locale));
  const visible = useUiStore((s) => s.legendVisible);
  const setVisible = useUiStore((s) => s.setLegendVisible);

  if (!visible) {
    return (
      <button
        type="button"
        className="legend-toggle"
        onClick={() => setVisible(true)}
        title={t('legend.title')}
      >
        {t('legend.title')}
      </button>
    );
  }

  return (
    <aside className="color-legend" aria-label={t('legend.title')}>
      <div className="legend-head">
        <strong>{t('legend.title')}</strong>
        <button type="button" className="legend-close" onClick={() => setVisible(false)} aria-label={t('dialog.close')}>
          ×
        </button>
      </div>
      <ul>
        {ITEMS.map((item) => (
          <li key={item.key}>
            <span className="legend-swatch" style={{ background: `var(${item.css})` }} />
            <span>{t(item.key)}</span>
          </li>
        ))}
      </ul>
      <p className="legend-note">{t('legend.note')}</p>
    </aside>
  );
}
