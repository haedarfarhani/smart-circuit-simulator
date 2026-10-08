import { useState } from 'react';
import { makeT } from '../../i18n';
import { useCircuitStore } from '../../store/circuitStore';
import { useUiStore } from '../../store/uiStore';
import { CATEGORIES, SYMBOLS, switchLever } from '../../core/symbols';
import type { ComponentType } from '../../models/circuit';

/** Small live preview of a component symbol for the library tile. */
function SymbolPreview({ type }: { type: ComponentType }) {
  const def = SYMBOLS[type];
  const halfW = def.w / 2 + 6;
  const halfH = Math.max(def.h / 2 + 6, 24);
  return (
    <svg
      viewBox={`${-halfW} ${-halfH} ${halfW * 2} ${halfH * 2}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <g className="sym-group" style={{ color: 'inherit' }}>
        {def.body}
        {type === 'switch' && switchLever(false)}
      </g>
    </svg>
  );
}

function LibraryItem({ type }: { type: ComponentType }) {
  const t = makeT(useUiStore((s) => s.locale));
  const addAtCenter = useCircuitStore((s) => s.addComponent);
  const select = useUiStore((s) => s.select);
  const setStatus = useUiStore((s) => s.setStatus);

  const placeAtCenter = () => {
    const ui = useUiStore.getState();
    const rect = document
      .querySelector('.canvas-wrap')
      ?.getBoundingClientRect();
    const sx = rect ? rect.width / 2 : window.innerWidth / 2;
    const sy = rect ? rect.height / 2 : window.innerHeight / 2;
    const baseX = (sx - ui.panX) / ui.zoom;
    const baseY = (sy - ui.panY) / ui.zoom;

    const taken = (x: number, y: number) =>
      useCircuitStore
        .getState()
        .doc.components.some(
          (c) => Math.abs(c.x - x) < 110 && Math.abs(c.y - y) < 70,
        );

    const offsets: [number, number][] = [
      [0, 0],
      [120, 0],
      [120, 120],
      [0, 120],
      [-120, 120],
      [-120, 0],
      [-120, -120],
      [0, -120],
      [120, -120],
      [240, 0],
      [240, 120],
      [0, 240],
      [-240, 0],
      [-240, 120],
    ];
    let target = { x: baseX, y: baseY };
    for (const [ox, oy] of offsets) {
      const cand = { x: baseX + ox, y: baseY + oy };
      if (!taken(cand.x, cand.y)) {
        target = cand;
        break;
      }
    }

    const id = addAtCenter(type, target.x, target.y);
    if (id) {
      select([id]);
      setStatus('status.placed');
    }
  };

  const label = t(`lib.component.${type}`);

  return (
    <button
      className="lib-item"
      draggable
      title={`${label} — ${t('lib.dropHint')}`}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-circuit-type', type);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={placeAtCenter}
    >
      <div className="lib-item-icon-wrap">
        <SymbolPreview type={type} />
      </div>
      <span className="lib-item-label">{label}</span>
      <span className="lib-item-badge">{SYMBOLS[type].unit || '•'}</span>
    </button>
  );
}

/**
 * Wiring lives in the library next to the parts as well.
 */
function WireLibraryItem() {
  const t = makeT(useUiStore((s) => s.locale));
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const active = tool === 'wire';

  return (
    <button
      className="lib-item"
      data-active={active}
      aria-pressed={active}
      title={`${t('tool.wire')} (W)`}
      onClick={() => setTool('wire')}
    >
      <div className="lib-item-icon-wrap">
        <svg viewBox="0 0 120 60" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <g className="sym-group" style={{ color: 'inherit' }}>
            <path
              className="sym-line"
              d="M10 20h100"
              fill="none"
              strokeLinecap="round"
            />
            <path
              className="sym-line"
              d="M60 20v30"
              fill="none"
              strokeLinecap="round"
            />
            <circle className="sym-fill" cx="60" cy="20" r="4.5" />
          </g>
        </svg>
      </div>
      <span className="lib-item-label">{t('tool.wire')}</span>
      <span className="lib-item-badge">W</span>
    </button>
  );
}

export function LibrarySidebar() {
  const t = makeT(useUiStore((s) => s.locale));
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  if (collapsed) {
    return (
      <aside className="library is-collapsed">
        <button
          type="button"
          className="lib-expand-btn"
          title={t('sidebar.toggle')}
          onClick={toggleSidebar}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-11z" />
          </svg>
        </button>
      </aside>
    );
  }

  const allTypes = Object.keys(SYMBOLS) as ComponentType[];
  const normalizedSearch = search.trim().toLowerCase();

  const filteredTypes = allTypes.filter((type) => {
    // Category filter
    if (activeCategory !== 'all' && SYMBOLS[type].category !== activeCategory) {
      return false;
    }
    // Search query
    if (!normalizedSearch) return true;
    const enLabel = type.toLowerCase();
    const locLabel = t(`lib.component.${type}`).toLowerCase();
    return enLabel.includes(normalizedSearch) || locLabel.includes(normalizedSearch);
  });

  const categoryChips = [
    { id: 'all', label: t('lib.category.all') },
    { id: 'sources', label: t('lib.category.sources') },
    { id: 'passive', label: t('lib.category.passive') },
    { id: 'switches', label: t('lib.category.switches') },
    { id: 'actuators', label: t('lib.category.actuators') },
  ];

  return (
    <aside className="library" aria-label={t('lib.title')}>
      <div className="library-header">
        <div className="library-title-row">
          <div className="library-heading">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z" />
            </svg>
            <span>{t('lib.title')}</span>
          </div>
          <button
            type="button"
            className="lib-collapse-icon-btn"
            title={t('sidebar.toggle')}
            onClick={toggleSidebar}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z" />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="lib-search-box">
          <svg className="search-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
          </svg>
          <input
            type="text"
            className="lib-search-input"
            placeholder={t('lib.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearch('')}
            >
              ×
            </button>
          )}
        </div>

        {/* Category Chips */}
        <div className="lib-chips-scroller">
          {categoryChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`lib-filter-chip ${activeCategory === chip.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="library-body">
        {/* Wiring card when showing all or passives/connections */}
        {(!search || 'wire'.includes(normalizedSearch) || t('tool.wire').toLowerCase().includes(normalizedSearch)) &&
          (activeCategory === 'all' || activeCategory === 'passive') && (
            <div className="lib-section">
              <div className="lib-category-name">{t('lib.connections')}</div>
              <div className="lib-grid">
                <WireLibraryItem />
              </div>
            </div>
          )}

        {/* Grouped or filtered components */}
        {search || activeCategory !== 'all' ? (
          filteredTypes.length > 0 ? (
            <div className="lib-section">
              <div className="lib-grid">
                {filteredTypes.map((type) => (
                  <LibraryItem type={type} key={type} />
                ))}
              </div>
            </div>
          ) : (
            <div className="lib-no-results">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12z" />
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
              </svg>
              <span>{t('lib.noResults')}</span>
            </div>
          )
        ) : (
          CATEGORIES.map((cat) => {
            const items = allTypes.filter((type) => SYMBOLS[type].category === cat.id);
            if (items.length === 0) return null;
            return (
              <div className="lib-section" key={cat.id}>
                <div className="lib-category-name">{t(cat.labelKey)}</div>
                <div className="lib-grid">
                  {items.map((type) => (
                    <LibraryItem type={type} key={type} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="lib-hint-footer">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
        </svg>
        <span>{t('lib.dropHint')}</span>
      </div>
    </aside>
  );
}
