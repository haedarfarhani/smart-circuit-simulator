import { useEffect, useRef, useState } from 'react';
import { useCircuitStore } from '../../store/circuitStore';
import { useUiStore } from '../../store/uiStore';
import { useSimulationStore } from '../../store/simulationStore';
import { makeT } from '../../i18n';
import { EXAMPLE_CIRCUITS, getExample } from '../../core/examples';

interface MenuItemDef {
  labelKey: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

function BrandLogo() {
  return (
    <div className="brand-logo-wrap">
      <svg className="brand-logo" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
          <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <path
          d="M3 12h4l2-5 3 10 2.5-7 1.5 2h5"
          fill="none"
          stroke="url(#brandGrad)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="7" r="1.5" fill="#38bdf8" />
        <circle cx="12" cy="17" r="1.5" fill="#818cf8" />
      </svg>
    </div>
  );
}

function HeaderSimulationControls() {
  const ui = useUiStore();
  const t = makeT(ui.locale);
  const simulationStatus = useSimulationStore((s) => s.status);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!speedMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (speedRef.current && !speedRef.current.contains(e.target as Node)) {
        setSpeedMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [speedMenuOpen]);

  const speedPresets = [0.5, 1, 2, 5];

  return (
    <div className="sim-header-group">
      <button
        type="button"
        className={`sim-power-pill ${ui.simulationEnabled ? 'is-running' : 'is-stopped'}`}
        data-running={simulationStatus === 'running'}
        onClick={() => ui.setSimulationEnabled(!ui.simulationEnabled)}
        aria-pressed={ui.simulationEnabled}
        title={ui.simulationEnabled ? t('sim.disable') : t('sim.enable')}
      >
        <span className="power-indicator-ring">
          <span className="power-indicator-dot" />
        </span>
        <svg
          className="sim-power-icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          {ui.simulationEnabled ? (
            <path d="M4.5 3.5A.5.5 0 0 1 5 4v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm7 0a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z" />
          ) : (
            <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z" />
          )}
        </svg>
        <span className="sim-power-text">
          {ui.simulationEnabled
            ? simulationStatus === 'running'
              ? t('sim.running')
              : t('sim.paused')
            : t('sim.off')}
        </span>
      </button>

      {/* Speed Controller Popover */}
      <div className="sim-speed-popover-wrap" ref={speedRef}>
        <button
          type="button"
          className="sim-speed-trigger"
          title={t('sim.speed')}
          onClick={() => setSpeedMenuOpen(!speedMenuOpen)}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="m11.5 8 .5-.5a3.5 3.5 0 1 0-7 0l.5.5a2.5 2.5 0 1 1 6 0z" />
            <path d="M8 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
          </svg>
          <span>{ui.simulationSpeed.toFixed(1)}x</span>
        </button>

        {speedMenuOpen && (
          <div className="sim-speed-menu">
            <div className="speed-menu-title">{t('sim.speed')}</div>
            <div className="speed-preset-pills">
              {speedPresets.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  className={`speed-pill ${ui.simulationSpeed === sp ? 'active' : ''}`}
                  onClick={() => {
                    ui.setSimulationSpeed(sp);
                    setSpeedMenuOpen(false);
                  }}
                >
                  {sp}x
                </button>
              ))}
            </div>
            <div className="speed-slider-row">
              <input
                type="range"
                min="0.1"
                max="5"
                step="0.1"
                value={ui.simulationSpeed}
                onChange={(e) => ui.setSimulationSpeed(Number(e.target.value))}
                className="speed-range-slider"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const store = useCircuitStore();
  const ui = useUiStore();
  const locale = ui.locale;
  const t = makeT(locale);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const zoomBy = (factor: number) =>
    ui.setView({ zoom: ui.zoom * factor });

  const fileItems: MenuItemDef[] = [
    {
      labelKey: 'menu.file.new',
      shortcut: 'Ctrl+N',
      action: () => {
        if (
          store.doc.components.length === 0 ||
          window.confirm(t('menu.file.new') + '?')
        ) {
          store.newCircuit();
          ui.clearSelection();
          ui.setWireDraft(null);
          ui.setStatus('status.ready');
        }
      },
    },
    { labelKey: '', separator: true },
    { labelKey: 'menu.file.export', shortcut: 'Ctrl+S', action: () => ui.setDialog('transfer-export') },
    { labelKey: 'menu.file.import', shortcut: 'Ctrl+O', action: () => ui.setDialog('transfer-import') },
    { labelKey: '', separator: true },
    ...EXAMPLE_CIRCUITS.map((ex) => ({
      labelKey: ex.nameKey,
      action: () => {
        const result = getExample(ex.id);
        if (result) {
          store.setDoc(result.doc);
          ui.clearSelection();
          ui.setWireDraft(null);
          ui.setSimulationEnabled(true);
          ui.setStatus('status.ready');
        }
      },
    })),
  ];

  const editItems: MenuItemDef[] = [
    {
      labelKey: 'menu.edit.undo',
      shortcut: 'Ctrl+Z',
      disabled: store.past.length === 0,
      action: () => store.undo(),
    },
    {
      labelKey: 'menu.edit.redo',
      shortcut: 'Ctrl+Shift+Z',
      disabled: store.future.length === 0,
      action: () => store.redo(),
    },
    { labelKey: '', separator: true },
    {
      labelKey: 'menu.edit.selectAll',
      shortcut: 'Ctrl+A',
      action: () =>
        ui.select([
          ...store.doc.components.map((c) => c.id),
          ...store.doc.wires.map((w) => w.id),
        ]),
    },
    {
      labelKey: 'menu.edit.duplicate',
      shortcut: 'Ctrl+D',
      disabled: !ui.selection.some((id) =>
        store.doc.components.some((c) => c.id === id),
      ),
      action: () => {
        const ids = store.duplicateComponents(ui.selection);
        if (ids.length) ui.select(ids);
      },
    },
    {
      labelKey: 'menu.edit.delete',
      shortcut: 'Del',
      disabled: ui.selection.length === 0,
      action: () => {
        store.deleteElements(ui.selection);
        ui.clearSelection();
        ui.setStatus('status.deleted');
      },
    },
  ];

  const viewItems: MenuItemDef[] = [
    { labelKey: 'menu.view.zoomIn', shortcut: 'Ctrl++', action: () => zoomBy(1.25) },
    { labelKey: 'menu.view.zoomOut', shortcut: 'Ctrl+-', action: () => zoomBy(0.8) },
    {
      labelKey: 'menu.view.resetZoom',
      shortcut: 'Ctrl+0',
      action: () => ui.setView({ zoom: 1, panX: 0, panY: 0 }),
    },
    { labelKey: '', separator: true },
    {
      labelKey: 'menu.view.toggleGrid',
      action: () => ui.setGridVisible(!ui.gridVisible),
    },
    {
      labelKey: 'menu.view.toggleTheme',
      action: () => ui.toggleTheme(),
    },
  ];

  const helpItems: MenuItemDef[] = [
    { labelKey: 'menu.help.shortcuts', shortcut: '?', action: () => ui.setDialog('about') },
  ];

  const groups: { id: string; labelKey: string; items: MenuItemDef[] }[] = [
    { id: 'file', labelKey: 'menu.file', items: fileItems },
    { id: 'edit', labelKey: 'menu.edit', items: editItems },
    { id: 'view', labelKey: 'menu.view', items: viewItems },
    { id: 'help', labelKey: 'menu.help', items: helpItems },
  ];

  return (
    <header className="menubar" ref={rootRef}>
      {/* 1. Brand Logo & Name */}
      <div className="brand">
        <button
          type="button"
          className="sidebar-toggle-btn"
          title={t('sidebar.toggle')}
          aria-label={t('sidebar.toggle')}
          onClick={() => ui.toggleSidebar()}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z" />
          </svg>
        </button>

        <BrandLogo />
        <div className="brand-text">
          <span className="brand-name">
            Circuit<span className="accent">Lab</span>
          </span>
          <span className="brand-tag">v2.0</span>
        </div>
      </div>

      {/* 2. Menu Dropdowns */}
      <nav className="menu-group" aria-label="Main menu">
        {groups.map((g) => (
          <div className="menu-root" key={g.id}>
            <button
              className="menu-button"
              data-open={open === g.id}
              aria-haspopup="menu"
              aria-expanded={open === g.id}
              onClick={() => setOpen(open === g.id ? null : g.id)}
              onMouseEnter={() => open && setOpen(g.id)}
            >
              {t(g.labelKey)}
            </button>
            {open === g.id && (
              <div className="menu-dropdown" role="menu">
                {g.items.map((item, i) =>
                  item.separator ? (
                    <div className="menu-sep" key={`sep${i}`} />
                  ) : (
                    <button
                      className="menu-item"
                      key={item.labelKey}
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        setOpen(null);
                        item.action?.();
                      }}
                    >
                      <span>{t(item.labelKey)}</span>
                      {item.shortcut && <span className="kbd">{item.shortcut}</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="header-divider" />

      {/* 3. Primary Mode Tools (Select & Wire) */}
      <div className="workbench-tools" role="toolbar" aria-label="Workbench tools">
        <button
          className="mode-tool-btn"
          data-active={ui.tool === 'select'}
          onClick={() => ui.setTool('select')}
          title={`${t('tool.select')} (V)`}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 2l10 6-4.5 1.2L11 14l-2 .8-2.4-4.6L3 12.5z" />
          </svg>
          <span className="mode-label">{t('tool.select')}</span>
        </button>

        <button
          className="mode-tool-btn"
          data-active={ui.tool === 'wire'}
          onClick={() => ui.setTool('wire')}
          title={`${t('tool.wire')} (W)`}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M2 13h4l4-10h4" strokeLinecap="round" />
            <circle cx="2" cy="13" r="1.5" fill="currentColor" />
            <circle cx="14" cy="3" r="1.5" fill="currentColor" />
          </svg>
          <span className="mode-label">{t('tool.wire')}</span>
        </button>
      </div>

      <div className="header-divider" />

      {/* 4. Interactive Simulation Master Controls */}
      <HeaderSimulationControls />

      <div className="menubar-spacer" />

      {/* 5. Analysis / Learning Feature Tabs */}
      <div className="feature-nav-group" role="tablist" aria-label="Feature Views">
        <button
          className="feature-nav-btn"
          data-active={ui.inspectorTab === 'analysis'}
          onClick={() => ui.setInspectorTab('analysis')}
          title={t('features.analyzer')}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v3M8 11h.01" strokeLinecap="round" />
          </svg>
          <span>{t('features.analyzer')}</span>
        </button>

        <button
          className="feature-nav-btn"
          data-active={ui.bottomPanelOpen && ui.bottomPanelTab === 'oscilloscope'}
          onClick={() => {
            ui.setBottomPanelTab('oscilloscope');
            ui.setBottomPanelOpen(!ui.bottomPanelOpen || ui.bottomPanelTab !== 'oscilloscope');
          }}
          title={t('features.oscilloscope')}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
            <path d="M3.5 10l2.5-4 2 4 2.5-4 2 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{t('features.oscilloscope')}</span>
        </button>

        <button
          className="feature-nav-btn"
          data-active={ui.inspectorTab === 'learning'}
          onClick={() => ui.setInspectorTab('learning')}
          title={t('features.learning')}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a3 3 0 100 6 3 3 0 000-6z" />
            <path d="M5 12c0-1.7 1.3-3 3-3s3 1.3 3 3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span>{t('features.learning')}</span>
        </button>

        <button
          className="feature-nav-btn"
          data-active={ui.inspectorTab === 'practice'}
          onClick={() => ui.setInspectorTab('practice')}
          title={t('features.practice')}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 3h3v3H4zM9 3h3v3h-3zM4 9h3v3H4z" opacity="0.6" />
            <path d="M10 9h4v2h-4zM9 12h2v2h-2z" />
          </svg>
          <span>{t('features.practice')}</span>
        </button>
      </div>

      <div className="header-divider" />

      {/* 6. Language & Theme Utilities */}
      <div className="utility-group">
        <button
          className="lang-toggle-btn"
          title={locale === 'fa' ? 'Switch to English' : 'تغییر به زبان فارسی'}
          aria-label={locale === 'fa' ? 'Switch to English' : 'تغییر به زبان فارسی'}
          onClick={() => ui.setLocale(locale === 'fa' ? 'en' : 'fa')}
          data-testid="locale-toggle"
        >
          <span className="lang-code">{locale === 'fa' ? 'EN' : 'فا'}</span>
        </button>

        <button
          className="theme-toggle-btn"
          title={t('menu.view.toggleTheme')}
          aria-label={t('menu.view.toggleTheme')}
          onClick={() => ui.toggleTheme()}
        >
          {ui.theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="8" r="3.2" />
              <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
              </g>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <button
          className="help-icon-btn"
          title={t('menu.help.shortcuts')}
          aria-label={t('menu.help.shortcuts')}
          onClick={() => ui.setDialog('about')}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12z" />
            <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
