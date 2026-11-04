import { useEffect, useRef, useState } from 'react';
import { useCircuitStore } from '../../store/circuitStore';
import { useUiStore } from '../../store/uiStore';
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
        <path
          d="M4 12h3l2-6 3 12 2-6h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="6" r="1.4" fill="currentColor" />
        <circle cx="14" cy="18" r="1.4" fill="currentColor" />
      </svg>
    </div>
  );
}

/** Fixed anchor for a menu dropdown, computed from its trigger button. */
interface MenuAnchor {
  top: number;
  start: number;
}

/** Distance kept from the viewport edge when clamping a dropdown. */
const MENU_EDGE = 8;

function anchorForButton(btn: HTMLElement): MenuAnchor {
  const r = btn.getBoundingClientRect();
  const rtl = document.documentElement.dir === 'rtl';
  const start = rtl ? window.innerWidth - r.right : r.left;
  return {
    top: r.bottom + 6,
    start: Math.max(
      MENU_EDGE,
      Math.min(start, window.innerWidth - 238 - MENU_EDGE),
    ),
  };
}

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

  /** Open (or re-anchor) a dropdown. The dropdown is position:fixed so the
      menubar's horizontal scroll container can never clip it. */
  const openGroup = (id: string) => {
    const btn = groupRefs.current[id];
    setAnchor(btn ? anchorForButton(btn) : null);
    setOpen(id);
  };

  const zoomBy = (factor: number) =>
    ui.setView({ zoom: ui.zoom * factor });

  const fileItems: MenuItemDef[] = [
    {
      labelKey: 'menu.file.new',
      shortcut: 'Ctrl+N',
      action: () => {
        if (store.doc.components.length === 0) {
          store.newCircuit();
          ui.clearSelection();
          ui.setWireDraft(null);
          ui.setStatus('status.ready');
        } else {
          ui.setDialog('confirm-new');
        }
      },
    },
    { labelKey: '', separator: true },
    { labelKey: 'menu.file.export', shortcut: 'Ctrl+S', action: () => ui.setDialog('transfer-export') },
    { labelKey: 'menu.file.import', shortcut: 'Ctrl+O', action: () => ui.setDialog('transfer-import') },
    { labelKey: 'menu.file.settings', action: () => ui.setDialog('settings') },
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
      labelKey: 'menu.view.toggleLegend',
      action: () => ui.setLegendVisible(!ui.legendVisible),
    },
    {
      labelKey: 'menu.view.toggleInspector',
      action: () => ui.toggleInspector(),
    },
    {
      labelKey: 'menu.view.toggleTheme',
      action: () => ui.toggleTheme(),
    },
    {
      labelKey: 'menu.file.settings',
      action: () => ui.setDialog('settings'),
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
      <div className="menubar-row">
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
              ref={(el) => {
                groupRefs.current[g.id] = el;
              }}
              onClick={() => (open === g.id ? setOpen(null) : openGroup(g.id))}
              onMouseEnter={() => open && openGroup(g.id)}
            >
              {t(g.labelKey)}
            </button>
            {open === g.id && anchor && (
              <div
                className="menu-dropdown"
                role="menu"
                style={{
                  position: 'fixed',
                  top: anchor.top,
                  insetInlineStart: anchor.start,
                }}
              >
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

      <div className="menubar-spacer" />

      {/* 3. Language & Theme Utilities. Settings and the shortcuts dialog stay
             in the File / View / Help menus — no duplicate header icons.
             Analyzer / Learning / Practice live in the inspector tabs; the
             Oscilloscope has its own button on the canvas HUD. */}
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
      </div>
      </div>
    </header>
  );
}
