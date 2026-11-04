import { makeT } from '../../i18n';
import { formatValue } from '../../core/labels';
import { SYMBOLS } from '../../core/symbols';
import { useCircuitStore } from '../../store/circuitStore';
import { useSimulationStore } from '../../store/simulationStore';
import { useUiStore } from '../../store/uiStore';

export function MeasurementsPanel() {
  const t = makeT(useUiStore((s) => s.locale));
  const doc = useCircuitStore((s) => s.doc);
  const selection = useUiStore((s) => s.selection);
  const simulationEnabled = useUiStore((s) => s.simulationEnabled);
  const snapshot = useSimulationStore((s) => s.snapshot);
  const solverResult = useSimulationStore((s) => s.solverResult);
  const errors = useSimulationStore((s) => s.errors);

  const source = snapshot?.componentData ?? solverResult?.componentData;
  const selected = selection.length
    ? doc.components.filter((c) => selection.includes(c.id))
    : doc.components;

  if (!simulationEnabled) {
    return (
      <div className="panel-empty">
        <strong>{t('empty.measurements')}</strong>
        <p>{t('empty.measurementsHint')}</p>
      </div>
    );
  }

  if (errors.length > 0 && !source) {
    return (
      <div className="panel-empty error-state">
        <strong>{t('sim.failed')}</strong>
        <p>{errors[errors.length - 1]}</p>
      </div>
    );
  }

  if (!source || selected.length === 0) {
    return <div className="panel-empty">{t('empty.measurements')}</div>;
  }

  return (
    <div className="measure-grid">
      {selected.map((c) => {
        const data = source.get(c.id);
        if (!data) return null;
        const unit = SYMBOLS[c.type]?.unit ?? '';
        return (
          <article key={c.id} className="measure-card">
            <header>
              <b>{c.label}</b>
              <span>{t(`lib.component.${c.type}`)}</span>
            </header>
            <dl>
              <div>
                <dt>{t('inspector.voltage')}</dt>
                <dd>{data.voltage.toFixed(3)} V</dd>
              </div>
              <div>
                <dt>{t('inspector.current')}</dt>
                <dd>{data.current.toFixed(4)} A</dd>
              </div>
              <div>
                <dt>{t('inspector.power')}</dt>
                <dd>{data.power.toFixed(4)} W</dd>
              </div>
              {unit && (
                <div>
                  <dt>{t('inspector.value')}</dt>
                  <dd>{formatValue(c.value, unit)}</dd>
                </div>
              )}
              {data.bjt && (
                <>
                  <div>
                    <dt>{t('bjt.region')}</dt>
                    <dd>{t(`bjt.region.${data.bjt.region}`)}</dd>
                  </div>
                  <div>
                    <dt>VBE</dt>
                    <dd>{data.bjt.vbe.toFixed(3)} V</dd>
                  </div>
                  <div>
                    <dt>VCE</dt>
                    <dd>{data.bjt.vce.toFixed(3)} V</dd>
                  </div>
                  <div>
                    <dt>IB</dt>
                    <dd>{(data.bjt.ib * 1e6).toFixed(2)} µA</dd>
                  </div>
                  <div>
                    <dt>IC</dt>
                    <dd>{(data.bjt.ic * 1e3).toFixed(3)} mA</dd>
                  </div>
                  <div>
                    <dt>{t('bjt.beta')}</dt>
                    <dd>{Math.abs(data.bjt.ib) > 1e-12 ? data.bjt.beta.toFixed(1) : '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('bjt.junctionTemp')}</dt>
                    <dd>{data.bjt.tj.toFixed(1)} °C</dd>
                  </div>
                </>
              )}
              {data.capacitor && (
                <>
                  <div>
                    <dt>{t('cap.charge')}</dt>
                    <dd>{(data.capacitor.charge * 1e6).toFixed(2)} µC</dd>
                  </div>
                  <div>
                    <dt>{t('cap.energy')}</dt>
                    <dd>
                      {formatValue(data.capacitor.energy, 'J')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('cap.polarity') ?? 'Polarity'}</dt>
                    <dd>
                      {data.capacitor.polarity === 'reverse'
                        ? 'REVERSE'
                        : data.capacitor.polarity === 'normal'
                          ? '+ / −'
                          : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('cap.temperature')}</dt>
                    <dd>{data.capacitor.temperature.toFixed(1)} °C</dd>
                  </div>
                  <div>
                    <dt>{t('cap.rmsCurrent')}</dt>
                    <dd>{data.capacitor.rmsCurrent.toFixed(3)} A</dd>
                  </div>
                  {data.capacitor.reverseVoltage > 0 && (
                    <div>
                      <dt>{t('cap.reverseVoltage')}</dt>
                      <dd>{data.capacitor.reverseVoltage.toFixed(3)} V</dd>
                    </div>
                  )}
                  {(data.capacitor.overvoltage || data.capacitor.breakdown) && (
                    <div>
                      <dt>{t('cap.state')}</dt>
                      <dd>{data.capacitor.breakdown ? 'BREAKDOWN' : 'OVERVOLTAGE'}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </article>
        );
      })}
    </div>
  );
}
