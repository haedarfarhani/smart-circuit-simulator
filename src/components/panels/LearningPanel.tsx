import { useSimulationStore } from '../../store/simulationStore';
import { useUiStore } from '../../store/uiStore';
import { makeT } from '../../i18n';
import { generateLearningContent, getAllTopics } from '../../core/learningEngine';
import { useCircuitStore } from '../../store/circuitStore';
import { useMemo, useState } from 'react';

export function LearningPanel() {
  const locale = useUiStore((s) => s.locale);
  const t = makeT(locale);
  const doc = useCircuitStore((s) => s.doc);
  const snapshot = useSimulationStore((s) => s.snapshot);
  const solverResult = useSimulationStore((s) => s.solverResult);
  const topology = useSimulationStore((s) => s.topology);
  const selection = useUiStore((s) => s.selection);

  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const steps = useMemo(() => {
    if (!topology) return [];
    return generateLearningContent(doc, topology, solverResult);
  }, [doc, topology, solverResult]);

  const topics = useMemo(() => getAllTopics(), []);
  const highlightedComponents = selection.filter(id =>
    doc.components.some(c => c.id === id)
  );

  if (steps.length === 0) {
    return (
      <div className="learning-panel">
        <div className="panel-title">{t('learning.title') || 'Learning Mode'}</div>
        <div className="learning-empty">
          <p>{t('learning.noData') || 'Build a circuit to learn how it works.'}</p>
          {topics.length > 0 && (
            <div className="learning-topics">
              <div className="section-subtitle">{t('learning.topics') || 'Topics Covered'}</div>
              <div className="topics-list">
                {topics.map((topic, i) => (
                  <div key={i} className="topic-preview">
                    <strong>{topic.title}</strong>
                    <div className="topic-formula">{topic.formula}</div>
                    <p className="topic-description">{topic.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="learning-panel">
      <div className="panel-title-row">
        <div className="panel-title">{t('learning.title') || 'Learning Mode'}</div>
        {highlightedComponents.length > 0 && (
          <span className="learning-badge">
            {highlightedComponents.length} {t('learning.selected') || 'selected'}
          </span>
        )}
      </div>

      {highlightedComponents.length > 0 && (
        <div className="learning-selected-info">
          <span className="section-subtitle">{t('learning.selected') || 'Selected Components'}:</span>
          <div className="selected-components">
            {highlightedComponents.map(id => {
              const comp = doc.components.find(c => c.id === id);
              const sol =
                snapshot?.componentData.get(id) ??
                solverResult?.componentData.get(id);
              return (
                <div key={id} className="selected-comp">
                  <span className="comp-label">{comp?.label}</span>
                  {sol && (
                    <span className="comp-values">
                      V: {sol.voltage.toFixed(2)}V |
                      I: {sol.current.toFixed(3)}A |
                      P: {sol.power.toFixed(3)}W
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="learning-steps">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`learning-card ${step.highlightedComponents?.length ? 'highlighted' : ''}`}
          >
            <div
              className="learning-card-header"
              onClick={() => setExpandedStep(expandedStep === i ? null : i)}
            >
              <div className="step-number">{i + 1}</div>
              <div className="learning-card-title">
                <strong>{step.title}</strong>
                {step.highlightedComponents && step.highlightedComponents.length > 0 && (
                  <span className="highlight-badge">
                    {step.highlightedComponents.length} {t('inspector.components') || 'component(s)'}
                  </span>
                )}
              </div>
              <div className={`expand-icon ${expandedStep === i ? 'expanded' : ''}`}>
                <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {expandedStep === i && (
              <div className="learning-card-content">
                {step.formula && (
                  <div className="learning-formula">
                    <span className="formula-label">{t('learning.formula') || 'Formula'}:</span>
                    <code className="formula">{step.formula}</code>
                  </div>
                )}
                <p className="learning-explanation">{step.explanation}</p>
                {step.values && (
                  <div className="learning-values">
                    <span className="values-label">{t('learning.values') || 'Known Values'}:</span>
                    <pre className="values-content">{step.values}</pre>
                  </div>
                )}
                {step.result && (
                  <div className="learning-result">
                    <span className="result-label">{t('learning.result') || 'Result'}:</span>
                    <span className="result-content">{step.result}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
