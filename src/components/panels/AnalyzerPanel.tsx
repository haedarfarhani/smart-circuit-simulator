import { useSimulationStore } from '../../store/simulationStore';
import { useUiStore } from '../../store/uiStore';
import { makeT } from '../../i18n';
import { SYMBOLS } from '../../core/symbols';
import { formatValue } from '../../core/labels';
import { useCircuitStore } from '../../store/circuitStore';
import { useState } from 'react';

export function AnalyzerPanel() {
  const locale = useUiStore((s) => s.locale);
  const t = makeT(locale);
  const analysis = useSimulationStore((s) => s.analysis);
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);

  const doc = useCircuitStore((s) => s.doc);

  if (!analysis) {
    return (
      <div className="analyzer-empty">
        <div className="analyzer-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 20V10M9 20V4M15 20v-7M21 20V7" strokeLinecap="round" />
          </svg>
        </div>
        <div className="analyzer-empty-title">{t('analyzer.title')}</div>
        <p className="analyzer-empty-text">{t('analyzer.noData')}</p>
        <p className="analyzer-empty-hint">{t('analyzer.noDataHint')}</p>
      </div>
    );
  }

  const selectComponent = (compId: string) => {
    useUiStore.getState().select([compId]);
    setHighlightedPath([compId]);
  };

  const issues = analysis.errors.length + analysis.warnings.length;

  const metrics: Array<{ key: string; label: string; value: string; tone?: 'accent' | 'power' }> = [
    { key: 'nodes', label: t('analyzer.nodes'), value: String(analysis.nodesCount) },
    { key: 'components', label: t('analyzer.components'), value: String(analysis.componentsCount) },
    { key: 'branches', label: t('analyzer.branches'), value: String(analysis.branchesCount) },
    { key: 'loops', label: t('analyzer.loops'), value: String(analysis.loopsCount) },
    {
      key: 'resistance',
      label: t('analyzer.eqResistance'),
      value:
        analysis.equivalentResistance > 0
          ? formatValue(analysis.equivalentResistance, 'Ω')
          : '—',
    },
    {
      key: 'current',
      label: t('analyzer.totalCurrent'),
      value: formatValue(analysis.totalCurrent, 'A'),
      tone: 'accent',
    },
    {
      key: 'power',
      label: t('analyzer.totalPower'),
      value: formatValue(analysis.totalPower, 'W'),
      tone: 'power',
    },
    {
      key: 'sections',
      label: t('analyzer.connectedSections'),
      value: String(analysis.connectedComponents),
    },
  ];

  return (
    <div className="analyzer-panel">
      <header className={`analyzer-hero ${analysis.valid ? 'is-ok' : 'is-err'}`}>
        <span className="analyzer-hero-dot" aria-hidden="true" />
        <div className="analyzer-hero-text">
          <div className="analyzer-hero-title">{t('analyzer.title')}</div>
          <div className="analyzer-hero-sub">
            {analysis.componentsCount} {t('analyzer.components')} ·{' '}
            {analysis.nodesCount} {t('analyzer.nodes')}
          </div>
        </div>
        <span className="analyzer-pill">
          {analysis.valid ? t('analyzer.valid') : t('analyzer.invalid')}
        </span>
      </header>

      <section className="analyzer-block">
        <div className="analyzer-block-head">
          <span className="analyzer-block-title">{t('analyzer.overview')}</span>
        </div>
        <div className="analyzer-metric-grid">
          {metrics.map((m) => (
            <div className="analyzer-metric-tile" key={m.key}>
              <span className="analyzer-metric-k">{m.label}</span>
              <span className={`analyzer-metric-v${m.tone ? ` ${m.tone}` : ''}`}>
                {m.value}
              </span>
            </div>
          ))}
        </div>
      </section>

      {issues > 0 && (
        <section className="analyzer-block">
          <div className="analyzer-block-head">
            <span className="analyzer-block-title">
              {analysis.errors.length > 0
                ? t('analyzer.invalid')
                : t('analyzer.warnings')}
            </span>
            <span className="analyzer-count">{issues}</span>
          </div>

          {analysis.errors.map((e, i) => {
            const match = e.match(/([A-Za-z]+)(\d+)/);
            const comp = match
              ? doc.components.find((c) => c.label === match[0])
              : undefined;
            return (
              <div key={`err-${i}`} className="analyzer-issue err">
                <span className="issue-badge" aria-hidden="true">
                  !
                </span>
                <div className="issue-body">
                  <span>{e}</span>
                  {comp && (
                    <button
                      type="button"
                      className="issue-link"
                      onClick={() => selectComponent(comp.id)}
                    >
                      {t('analyzer.showProblem')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {analysis.warnings.map((w, i) => (
            <div key={`warn-${i}`} className="analyzer-issue warn">
              <span className="issue-badge" aria-hidden="true">
                i
              </span>
              <div className="issue-body">
                <span>{w}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {analysis.components.length > 0 && (
        <section className="analyzer-block">
          <div className="analyzer-block-head">
            <span className="analyzer-block-title">
              {t('analyzer.componentsAnalysis')}
            </span>
            <span className="analyzer-count">{analysis.components.length}</span>
          </div>

          <div className="analyzer-comp-list">
            {analysis.components.map((c) => {
              const def = SYMBOLS[c.type as keyof typeof SYMBOLS];
              const isHighlighted = highlightedPath.includes(c.id);

              return (
                <article
                  key={c.id}
                  className={`analyzer-comp-card${isHighlighted ? ' is-selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isHighlighted}
                  onClick={() => selectComponent(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectComponent(c.id);
                    }
                  }}
                >
                  <div className="analyzer-comp-top">
                    <span className="analyzer-comp-label">{c.label}</span>
                    <span className="analyzer-comp-type">
                      {def ? t(`lib.component.${c.type}`) : c.type}
                    </span>
                    {c.state !== 'normal' && (
                      <span className={`comp-state-pill ${c.state}`}>
                        {t(`analyzer.state.${c.state}`)}
                      </span>
                    )}
                    {isHighlighted && (
                      <span className="analyzer-selected-chip">
                        {t('analyzer.selected')}
                      </span>
                    )}
                  </div>

                  <div className="analyzer-comp-value">
                    {def?.unit ? formatValue(c.value, def.unit) : '—'}
                  </div>

                  {analysis.valid && (
                    <div className="analyzer-comp-metrics">
                      <div className="analyzer-metric">
                        <span className="analyzer-metric-k">V</span>
                        <span className="analyzer-metric-v voltage">
                          {formatValue(c.voltage, 'V')}
                        </span>
                      </div>
                      <div className="analyzer-metric">
                        <span className="analyzer-metric-k">I</span>
                        <span className="analyzer-metric-v current">
                          {formatValue(c.current, 'A')}
                        </span>
                      </div>
                      <div className="analyzer-metric">
                        <span className="analyzer-metric-k">P</span>
                        <span className="analyzer-metric-v power">
                          {formatValue(c.power, 'W')}
                        </span>
                      </div>
                    </div>
                  )}

                  {(c.seriesWith.length > 0 || c.parallelWith.length > 0) && (
                    <div className="analyzer-relations">
                      {c.seriesWith.length > 0 && (
                        <span className="analyzer-rel-chip">
                          <b>{t('analyzer.series')}</b>
                          {c.seriesWith
                            .map(
                              (id) =>
                                doc.components.find((x) => x.id === id)?.label ?? id,
                            )
                            .join(' · ')}
                        </span>
                      )}
                      {c.parallelWith.length > 0 && (
                        <span className="analyzer-rel-chip">
                          <b>{t('analyzer.parallel')}</b>
                          {c.parallelWith
                            .map(
                              (id) =>
                                doc.components.find((x) => x.id === id)?.label ?? id,
                            )
                            .join(' · ')}
                        </span>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
