/**
 * Engineering-notation parsing/formatting for SI-prefixed values
 * ("10k" = 10,000 · "100u" = 0.0001 · "4m7" = 0.0047).
 */

const PREFIX_FACTORS: Record<string, number> = {
  '': 1,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  meg: 1e6,
  G: 1e9,
  m: 1e-3,
  u: 1e-6,
  µ: 1e-6,
  n: 1e-9,
  p: 1e-12,
};

/** Parse "10k" / "4m7" / "1e-6" / "0.1" into a number; null when invalid. */
export function parseEngineeringValue(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (!s) return null;
  // compact notation: 4m7 → 4.7m, 1k5 → 1.5k
  const compact = s.match(/^(-?\d+)([kKmMuµnpGM])(\d+)$/);
  const text = compact ? `${compact[1]}.${compact[3]}${compact[2]}` : s;
  const m = text.match(
    /^(-?(?:\d+\.?\d*|\.\d+))(?:[eE]([+-]?\d+))?([a-zA-Zµ]*)$/,
  );
  if (!m) return null;
  const exponent = m[2] ? Math.pow(10, parseInt(m[2], 10)) : 1;
  const base = parseFloat(m[1]) * exponent;
  const factor = m[3] in PREFIX_FACTORS ? PREFIX_FACTORS[m[3]] : null;
  if (factor === null || !Number.isFinite(base)) return null;
  const value = base * factor;
  return Number.isFinite(value) ? value : null;
}

/** Format a number using an SI prefix ("10000" → "10k"). */
export function formatEngineering(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  const table: [number, string][] = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'u'],
    [1e-9, 'n'],
    [1e-12, 'p'],
  ];
  for (const [threshold, prefix] of table) {
    if (abs >= threshold) {
      const scaled = value / threshold;
      const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
      return `${parseFloat(scaled.toFixed(digits))}${prefix}`;
    }
  }
  return value.toPrecision(3);
}
