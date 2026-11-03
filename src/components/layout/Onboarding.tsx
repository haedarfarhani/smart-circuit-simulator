import { useState } from 'react';
import { makeT } from '../../i18n';
import { getExample } from '../../core/examples';
import { useCircuitStore } from '../../store/circuitStore';
import { useUiStore } from '../../store/uiStore';

const STEPS = [
  'onboard.step1',
  'onboard.step2',
  'onboard.step3',
  'onboard.step4',
  'onboard.step5',
  'onboard.step6',
] as const;

export function Onboarding() {
  const t = makeT(useUiStore((s) => s.locale));
  const done = useUiStore((s) => s.onboardingDone);
  const [step, setStep] = useState(0);

  if (done) return null;

  const close = () => useUiStore.getState().setOnboardingDone(true);

  return (
    <div className="overlay onboard-overlay" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <div className="dialog onboard-dialog">
        <div className="dialog-head">
          <h2 id="onboard-title">{t('onboard.title')}</h2>
          <button className="close-x" onClick={close} aria-label={t('onboard.skip')}>
            ×
          </button>
        </div>
        <div className="dialog-body">
          <p className="onboard-step">{t(STEPS[step])}</p>
          <div className="onboard-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={i === step ? 'is-on' : ''} />
            ))}
          </div>
        </div>
        <div className="dialog-foot onboard-foot">
          <button type="button" className="btn" onClick={close}>
            {t('onboard.skip')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const r = getExample('rc-charge') ?? getExample('ac-led');
              if (r) {
                useCircuitStore.getState().setDoc(r.doc);
                useUiStore.getState().clearSelection();
                useUiStore.getState().setSimulationEnabled(true);
              }
              close();
            }}
          >
            {t('onboard.sample')}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>
              {t('onboard.next')}
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={close}>
              {t('onboard.done')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
