import { useState, useEffect } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import { useUiStore } from '../../store/uiStore';
import { makeT } from '../../i18n';
import { challenges, getChallengeById } from '../../core/practiceEngine';
import { useCircuitStore } from '../../store/circuitStore';

export function PracticePanel() {
  const locale = useUiStore((s) => s.locale);
  const t = makeT(locale);

  const doc = useCircuitStore((s) => s.doc);
  const solverResult = useSimulationStore((s) => s.solverResult);
  const topology = useSimulationStore((s) => s.topology);

  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState<number>(0);
  const [attempts, setAttempts] = useState<number>(0);
  const [lastResult, setLastResult] = useState<{success: boolean; message: string} | null>(null);

  const activeChallenge = activeChallengeId ? getChallengeById(activeChallengeId) : null;

  useEffect(() => {
    if (activeChallenge && topology) {
      const result = activeChallenge.validate(doc, topology, solverResult);
      setLastResult(result);
    }
  }, [doc, topology, solverResult, activeChallengeId]);

  const handleStart = (id: string) => {
    setActiveChallengeId(id);
    setHintLevel(0);
    setAttempts(0);
    setLastResult(null);
  };

  const handleShowHint = () => {
    if (activeChallenge && hintLevel < activeChallenge.hints.length) {
      setHintLevel(prev => prev + 1);
    }
  };

  const handleTryAgain = () => {
    setAttempts(prev => prev + 1);
    setLastResult(null);
  };

  const calculateScore = () => {
    if (!lastResult || !lastResult.success) return 0;
    const hintPenalty = hintLevel * 100;
    const attemptPenalty = (attempts) * 50;
    return Math.max(0, 1000 - hintPenalty - attemptPenalty);
  };

  if (!activeChallenge) {
    return (
      <div className="practice-panel">
        <div className="panel-title">{t('practice.title') || 'Practice & Challenges'}</div>
        <p className="practice-intro">
          {t('practice.intro') || 'Build circuits to solve electrical engineering challenges. Learn by doing!'}
        </p>

        <div className="difficulty-tabs">
          <button
            className={`diff-tab ${'beginner'}`}
            onClick={() => {/* Could filter */}}
          >
            Beginner
          </button>
          <button
            className={`diff-tab ${'intermediate'}`}
            onClick={() => {/* Could filter */}}
          >
            Intermediate
          </button>
          <button
            className={`diff-tab ${'advanced'}`}
            onClick={() => {/* Could filter */}}
          >
            Advanced
          </button>
        </div>

        <div className="practice-list">
          {challenges.map(c => (
            <div key={c.id} className="practice-card">
              <div className="practice-card-header">
                <div>
                  <strong>{c.title}</strong>
                  <span className={`difficulty-badge ${c.difficulty}`}>
                    {c.difficulty}
                  </span>
                </div>
                <div className="challenge-actions">
                  <span className="challenge-hint-count" title="Hints available">
                    💡 {c.hints.length}
                  </span>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleStart(c.id)}
                  >
                    Start
                  </button>
                </div>
              </div>
              <p className="challenge-description">{c.description}</p>
              <div className="challenge-requirements">
                {c.requirements.map((req, i) => (
                  <div key={i} className="requirement">
                    <span className="req-dot">•</span>
                    {req}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const score = calculateScore();

  type ValidationResult = { success: boolean; message: string; expected?: string; actual?: string };
  const validationWithDetails = (lastResult || (topology && solverResult
    ? activeChallenge.validate(doc, topology, solverResult)
    : { success: false, message: 'Build the circuit and run simulation to check.' })) as ValidationResult;

  return (
    <div className="practice-panel practice-active">
      <div className="practice-header">
        <button
          className="btn btn-icon back-btn"
          onClick={() => {
            setActiveChallengeId(null);
            setHintLevel(0);
            setAttempts(0);
            setLastResult(null);
          }}
          aria-label={t('common.cancel') || 'Back'}
        >
          ←
        </button>
        <div className="challenge-title-row">
          <h3>{activeChallenge.title}</h3>
          <span className={`difficulty-badge ${activeChallenge.difficulty}`}>
            {activeChallenge.difficulty}
          </span>
        </div>
      </div>

      <div className="challenge-desc">
        {activeChallenge.description}
      </div>

      <div className="challenge-requirements">
        <div className="section-subtitle">Requirements:</div>
        {activeChallenge.requirements.map((req, i) => (
          <div key={i} className="requirement">
            <span className="req-dot">○</span>
            {req}
          </div>
        ))}
      </div>

      <div className={`challenge-status ${validationWithDetails.success ? 'success' : ''}`}>
        {validationWithDetails.success ? (
          <>
            <div className="status-icon success-icon">✓</div>
            <div className="status-content">
              <strong>{t('practice.success') || 'Challenge Completed!'}</strong>
              <p>{validationWithDetails.message}</p>
              {score > 0 && (
                <div className="score-display">
                  <span className="score-label">Score:</span>
                  <span className="score-value">{score} / 1000</span>
                  <div className="score-breakdown">
                    <span>Attempts: {attempts}</span>
                    <span>Hints: {hintLevel}</span>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="status-content">
            <div className="status-icon pending-icon">○</div>
            <p>{validationWithDetails.message}</p>
            {validationWithDetails.expected && validationWithDetails.actual && (
              <div className="expected-actual">
                <div className="ea-item">
                  <span className="ea-label">Expected:</span>
                  <span className="ea-value">{validationWithDetails.expected}</span>
                </div>
                <div className="ea-item">
                  <span className="ea-label">Actual:</span>
                  <span className="ea-value">{validationWithDetails.actual}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!validationWithDetails.success && (
        <div className="challenge-hints">
          <button
            className="btn btn-primary"
            onClick={handleTryAgain}
          >
            {t('practice.tryAgain') || 'Try Again'}
          </button>
          <button
            className="btn"
            onClick={handleShowHint}
            disabled={hintLevel >= activeChallenge.hints.length}
          >
            {t('practice.showHint') || 'Show Hint'} ({hintLevel}/{activeChallenge.hints.length})
          </button>

          {hintLevel > 0 && (
            <div className="hint-list">
              <div className="hints-title">{t('practice.hints') || 'Hints'}</div>
              {activeChallenge.hints.slice(0, hintLevel).map((h, i) => (
                <div key={i} className="hint-item">
                  <span className="hint-number">{i + 1}</span>
                  <span className="hint-text">{h}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
