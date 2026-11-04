import { useEffect, useState } from 'react';
import { formatEngineering, parseEngineeringValue } from '../../utils/units';

/**
 * Numeric input that accepts engineering notation ("10k", "100u", "4m7")
 * as well as plain numbers. Commits the parsed value on every valid
 * keystroke; shows an inline error while the text is not parseable.
 */
export function UnitInput({
  value,
  onChange,
  ariaLabel,
  hint,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel?: string;
  hint?: string;
}) {
  const [text, setText] = useState(() => formatEngineering(value));
  const [focused, setFocused] = useState(false);
  const invalid = parseEngineeringValue(text) === null;

  // Follow external value changes while not being edited.
  useEffect(() => {
    if (!focused) setText(formatEngineering(value));
  }, [value, focused]);

  return (
    <div className="unit-input-wrap">
      <input
        type="text"
        inputMode="decimal"
        className={`unit-input${invalid && focused ? ' invalid' : ''}`}
        value={focused ? text : formatEngineering(value)}
        aria-label={ariaLabel}
        spellCheck={false}
        onFocus={() => {
          setFocused(true);
          setText(formatEngineering(value));
        }}
        onBlur={() => {
          setFocused(false);
          setText(formatEngineering(value));
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const parsed = parseEngineeringValue(raw);
          if (parsed !== null) onChange(parsed);
        }}
      />
      {invalid && focused ? (
        <span className="unit-input-error">{hint}</span>
      ) : (
        hint && !focused && <span className="unit-input-hint">{hint}</span>
      )}
    </div>
  );
}
