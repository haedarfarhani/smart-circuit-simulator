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
    return <div className="panel-empty">{t('analyzer.noData')}</div>;
  }

  const handleShowProblem = (compId: string) => {
    useUiStore.getState().select([compId]);
    setHighlightedPath([compId]);
  };

  return (
    <div className="analyzer-panel">
      <div className="panel-title">{t('analyzer.title')}</div>

      {/* Overview Section */}
      <div className="analyzer-section">
        <div className="analyzer-status">
          {analysis.valid ? (
            <span className="status-ok">
              <span className="status-icon">✓</span>
              {t('analyzer.valid')}
            </span>
          ) : (
            <span className="status-err">
              <span className="status-icon">✗</span>
              {t('analyzer.invalid')}
            </span>
          )}
        </div>

        <div className="analyzer-stats-grid">
          <div className="stat-item">
            <span className="stat-label">{t('analyzer.nodes')}</span>
            <span className="stat-value">{analysis.nodesCount}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('analyzer.components')}</span>
            <span className="stat-value">{analysis.componentsCount}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('analyzer.branches')}</span>
            <span className="stat-value">{analysis.branchesCount}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('analyzer.loops')}</span>
            <span className="stat-value">{analysis.loopsCount}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('analyzer.eqResistance')}</span>
            <span className="stat-value">{analysis.equivalentResistance > 0
              ? formatValue(analysis.equivalentResistance, 'Ω')
              : '—'}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('analyzer.totalCurrent')}</span>
            <span className="stat-value">{formatValue(analysis.totalCurrent, 'A')}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('analyzer.totalPower')}</span>
            <span className="stat-value">{formatValue(analysis.totalPower, 'W')}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Connected Sections</span>
            <span className="stat-value">{analysis.connectedComponents}</span>
          </div>
        </div>
      </div>

      {/* Electrical Values Section */}
      {analysis.valid && analysis.totalPower > 0 && (
        <div className="analyzer-section">
          <div className="section-subtitle">{t('analyzer.electricalValues')}</div>
          <table className="analyzer-stats-table">
            <tbody>
              <tr>
                <td>{t('analyzer.totalCurrent')}</td>
                <td>{formatValue(analysis.totalCurrent, 'A')}</td>
              </tr>
              <tr>
                <td>{t('analyzer.totalPower')}</td>
                <td>{formatValue(analysis.totalPower, 'W')}</td>
              </tr>
              <tr>
                <td>{t('analyzer.eqResistance')}</td>
                <td>{formatValue(analysis.equivalentResistance, 'Ω')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Issues Section */}
      {(analysis.errors.length > 0 || analysis.warnings.length > 0) && (
        <div className="analyzer-section issues">
          <div className="section-subtitle">
            {analysis.errors.length > 0 ? t('analyzer.invalid') : t('analyzer.valid')}
          </div>
          {analysis.errors.map((e, i) => (
            <div key={`err-${i}`} className="analyzer-issue err">
              <span className="issue-icon">⚠</span>
              <span>{e}</span>
              <button
                className="issue-action"
                onClick={() => {
                  // Try to find the component ID in the error
                  const match = e.match(/(R|V|C|L|SW|M|SOL|GND)(\d+)/);
                  if (match) {
                    const comp = doc.components.find(c =>
                      c.label === match[0]
                    );
                    if (comp) handleShowProblem(comp.id);
                  }
                }}
              >
                {t('analyzer.showProblem') || 'Show'}
              </button>
            </div>
          ))}
          {analysis.warnings.map((w, i) => (
            <div key={`warn-${i}`} className="analyzer-issue warn">
              <span className="issue-icon">ℹ</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Component Analysis Section */}
      {analysis.components.length > 0 && (
        <div className="analyzer-section">
          <div className="section-subtitle">{t('analyzer.componentsAnalysis')}</div>
          <div className="analyzer-components-list">
            {analysis.components.map((c) => {
              const def = SYMBOLS[c.type as keyof typeof SYMBOLS];
              const isHighlighted = highlightedPath.includes(c.id);

              return (
                <div
                  key={c.id}
                  className={`analyzer-comp-card ${isHighlighted ? 'highlighted' : ''}`}
                >
                  <div className="comp-card-header">
                    <strong>{c.label}</strong>
                    <span>{def ? t(`lib.component.${c.type}`) : c.type}</span>
                    {isHighlighted && (
                      <span className="highlight-badge">Selected</span>
                    )}
                  </div>
                  <div className="comp-card-value">
                    {def?.unit ? formatValue(c.value, def.unit) : ''}
                  </div>

                  {analysis.valid && (
                    <div className="comp-card-metrics">
                      <div className="metric">
                        <span className="metric-label">V</span>
                        <span className="metric-value voltage">{formatValue(c.voltage, 'V')}</span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">I</span>
                        <span className="metric-value current">{formatValue(c.current, 'A')}</span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">P</span>
                        <span className="metric-value power">{formatValue(c.power, 'W')}</span>
                      </div>
                    </div>
                  )}

                  {c.state !== 'normal' && (
                    <div className={`comp-state ${c.state}`}>
                      {t(`analyzer.state.${c.state}`)}
                    </div>
                  )}

                  {/* Series/Parallel info */}
                  {(c.seriesWith.length > 0 || c.parallelWith.length > 0) && (
                    <div className="comp-relations">
                      {c.seriesWith.length > 0 && (
                        <div className="relation">
                          <span className="relation-label">Series:</span>
                          <span className="relation-values">
                            {c.seriesWith.map(id => {
                              const comp = doc.components.find(c => c.id === id);
                              return comp?.label || id;
                            }).join(', ')}
                          </span>
                        </div>
                      )}
                      {c.parallelWith.length > 0 && (
                        <div className="relation">
                          <span className="relation-label">Parallel:</span>
                          <span className="relation-values">
                            {c.parallelWith.map(id => {
                              const comp = doc.components.find(c => c.id === id);
                              return comp?.label || id;
                            }).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}


    </div>
  );
}
