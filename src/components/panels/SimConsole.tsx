import { makeT } from '../../i18n';
import { useSimulationStore } from '../../store/simulationStore';
import { useUiStore } from '../../store/uiStore';

export function SimConsole() {
  const t = makeT(useUiStore((s) => s.locale));
  const errors = useSimulationStore((s) => s.errors);
  const warnings = useSimulationStore((s) => s.warnings);
  const status = useSimulationStore((s) => s.status);
  const simTime = useSimulationStore((s) => s.simTime);
  const snapshot = useSimulationStore((s) => s.snapshot);

  const lines: { kind: 'error' | 'warn' | 'info'; text: string }[] = [];
  lines.push({
    kind: 'info',
    text: `${t('sim.clock')}: ${status} · t=${simTime.toFixed(6)}s`,
  });
  if (snapshot && !snapshot.valid && snapshot.error) {
    lines.push({ kind: 'error', text: snapshot.error });
  }
  for (const e of errors) lines.push({ kind: 'error', text: e });
  for (const w of warnings) lines.push({ kind: 'warn', text: w });

  if (errors.length === 0 && warnings.length === 0 && snapshot?.valid !== false) {
    lines.push({ kind: 'info', text: t('empty.consoleOk') });
  }

  return (
    <div className="sim-console" role="log" aria-live="polite">
      {lines.length === 0 ? (
        <div className="panel-empty">{t('empty.console')}</div>
      ) : (
        <ul>
          {lines.map((line, i) => (
            <li key={i} data-kind={line.kind}>
              <span className="console-tag">{line.kind}</span>
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
