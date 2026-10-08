import { makeT } from '../../i18n';
import { useCircuitStore } from '../../store/circuitStore';
import { useUiStore } from '../../store/uiStore';

export function StatusBar() {
  const locale = useUiStore((s) => s.locale);
  const t = makeT(locale);
  const tool = useUiStore((s) => s.tool);
  const statusKey = useUiStore((s) => s.statusKey);
  const zoom = useUiStore((s) => s.zoom);
  const gridVisible = useUiStore((s) => s.gridVisible);
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const selection = useUiStore((s) => s.selection);
  const wireDraft = useUiStore((s) => s.wireDraft);

  const compCount = useCircuitStore((s) => s.doc.components.length);
  const wireCount = useCircuitStore((s) => s.doc.wires.length);
  const lastChange = useCircuitStore((s) => s.lastChange);
  const savedAt = useCircuitStore((s) => s.savedAt);

  let message = t(`${tool === 'wire' ? 'tool.wire' : 'tool.select'}.hint`);
  if (selection.length > 0) message = `${selection.length} · ${t('status.components')}`;
  if (statusKey) message = t(statusKey);
  if (wireDraft) message = t('status.wireStart');

  const dirty = savedAt === null ? lastChange > 0 : lastChange > savedAt;

  return (
    <footer className="statusbar">
      <span className={`save-dot${dirty ? ' dirty' : ''}`} aria-hidden="true" />
      <span className="status-msg" title={message}>
        {message}
      </span>

      <span className="chip">
        {t('status.components')} <b>{compCount}</b>
      </span>
      <span className="chip">
        {t('status.wires')} <b>{wireCount}</b>
      </span>
      <span className="chip">
        {t('status.grid')} <b>{gridVisible ? 'on' : 'off'}</b>
      </span>
      <span className="chip">
        {t('status.snap')} <b>{snapEnabled ? 'on' : 'off'}</b>
      </span>
      <span className="chip">
        {t('status.zoom')} <b>{Math.round(zoom * 100)}%</b>
      </span>
      <span className="chip">{dirty ? t('status.unsaved') : t('status.saved')}</span>
    </footer>
  );
}
