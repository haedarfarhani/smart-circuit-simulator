import { useId, type ReactNode } from 'react';
import type { ComponentType } from '../../models/circuit';

/**
 * Vector illustrations of the physical parts behind the schematic symbols.
 *
 * Every entry is drawn in the same 120 × 84 viewBox so the hover card can
 * swap parts without reflowing. The drawings are deliberately schematic-
 * realistic: correct package shapes, bands, polarities and labels, not photos.
 */
export function RealPartArt({ type }: { type: ComponentType }) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  const commonDefs = (
    <defs>
      <linearGradient id={id('metal')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#eef2f7" />
        <stop offset="0.35" stopColor="#c3cbd6" />
        <stop offset="0.65" stopColor="#8d97a4" />
        <stop offset="1" stopColor="#5f6874" />
      </linearGradient>
      <linearGradient id={id('metalH')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#6b7480" />
        <stop offset="0.25" stopColor="#cfd6df" />
        <stop offset="0.55" stopColor="#9aa4b1" />
        <stop offset="1" stopColor="#5b636e" />
      </linearGradient>
      <linearGradient id={id('copper')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f7c08a" />
        <stop offset="0.5" stopColor="#d98b4a" />
        <stop offset="1" stopColor="#9c5a24" />
      </linearGradient>
      <linearGradient id={id('tan')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f2dfb8" />
        <stop offset="0.45" stopColor="#ddc28f" />
        <stop offset="1" stopColor="#b99a63" />
      </linearGradient>
      <linearGradient id={id('blue')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7fa2d8" />
        <stop offset="0.4" stopColor="#3f6096" />
        <stop offset="1" stopColor="#1c2f52" />
      </linearGradient>
      <linearGradient id={id('dark')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4a505a" />
        <stop offset="0.5" stopColor="#23272e" />
        <stop offset="1" stopColor="#0e1115" />
      </linearGradient>
      <linearGradient id={id('red')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff8a8a" />
        <stop offset="0.45" stopColor="#e02424" />
        <stop offset="1" stopColor="#8f0f0f" />
      </linearGradient>
      <linearGradient id={id('amber')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffd79a" />
        <stop offset="0.5" stopColor="#e79b3c" />
        <stop offset="1" stopColor="#a85f16" />
      </linearGradient>
      <linearGradient id={id('glass')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
        <stop offset="0.5" stopColor="#dfe9f3" stopOpacity="0.35" />
        <stop offset="1" stopColor="#9fb2c4" stopOpacity="0.25" />
      </linearGradient>
      <linearGradient id={id('screen')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#16342c" />
        <stop offset="1" stopColor="#06110e" />
      </linearGradient>
      <radialGradient id={id('glow')} cx="0.5" cy="0.45" r="0.6">
        <stop offset="0" stopColor="#ffd27a" stopOpacity="0.9" />
        <stop offset="1" stopColor="#ff9d2e" stopOpacity="0" />
      </radialGradient>
    </defs>
  );

  const shadow = <ellipse cx="60" cy="78" rx="34" ry="4.5" fill="#000" opacity="0.2" />;

  let art: ReactNode;

  switch (type) {
    case 'resistor':
      art = (
        <>
          {shadow}
          <line x1="4" y1="42" x2="34" y2="42" stroke={url('metal')} strokeWidth="3" />
          <line x1="86" y1="42" x2="116" y2="42" stroke={url('metal')} strokeWidth="3" />
          <rect x="32" y="27" width="56" height="30" rx="7" fill={url('tan')} stroke="#8a6f42" strokeWidth="1" />
          <rect x="34" y="29" width="52" height="8" rx="5" fill="#fff" opacity="0.28" />
          <rect x="44" y="27" width="7" height="30" fill="#5a3a1a" />
          <rect x="53" y="27" width="7" height="30" fill="#101010" />
          <rect x="62" y="27" width="7" height="30" fill="#c62828" />
          <rect x="73" y="27" width="6" height="30" fill="#d4af37" />
          <text x="60" y="68" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="currentColor" opacity="0.7">
            220 Ω
          </text>
        </>
      );
      break;

    case 'capacitor':
      art = (
        <>
          {shadow}
          <line x1="34" y1="56" x2="34" y2="78" stroke={url('metal')} strokeWidth="2.5" />
          <line x1="86" y1="56" x2="86" y2="78" stroke={url('metal')} strokeWidth="2.5" />
          <ellipse cx="60" cy="42" rx="31" ry="22" fill={url('amber')} stroke="#9a5a12" strokeWidth="1.5" />
          <ellipse cx="60" cy="38" rx="24" ry="15" fill="#ffd9a1" opacity="0.55" />
          <ellipse cx="60" cy="42" rx="31" ry="22" fill="none" stroke="#7c4409" strokeWidth="0.8" />
          <text x="60" y="46" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#5a3208">
            104
          </text>
          <text x="60" y="72" textAnchor="middle" fontSize="7.5" fontFamily="monospace" fill="currentColor" opacity="0.65">
            100 nF
          </text>
        </>
      );
      break;

    case 'polarized-capacitor':
      art = (
        <>
          {shadow}
          <rect x="42" y="12" width="36" height="58" rx="5" fill={url('blue')} stroke="#16233b" strokeWidth="1.2" />
          <ellipse cx="60" cy="13" rx="18" ry="5.5" fill={url('metal')} stroke="#5d6672" strokeWidth="0.8" />
          <path d="M54 13 L60 8 L66 13" fill="none" stroke="#6d7683" strokeWidth="1.4" />
          <rect x="74" y="22" width="7" height="42" rx="2" fill="#e8eef6" opacity="0.92" />
          <text x="77.5" y="32" textAnchor="middle" fontSize="7" fill="#20324d">
            −
          </text>
          <text x="77.5" y="44" textAnchor="middle" fontSize="7" fill="#20324d">
            −
          </text>
          <text x="77.5" y="56" textAnchor="middle" fontSize="7" fill="#20324d">
            −
          </text>
          <rect x="45" y="20" width="12" height="34" rx="4" fill="#fff" opacity="0.18" />
          <line x1="52" y1="70" x2="52" y2="80" stroke={url('metal')} strokeWidth="2.4" />
          <line x1="68" y1="70" x2="68" y2="80" stroke={url('metal')} strokeWidth="2.4" />
          <text x="56" y="64" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="#eaf1fb">
            470µ
          </text>
        </>
      );
      break;

    case 'lamp':
      art = (
        <>
          <circle cx="60" cy="34" r="30" fill={url('glow')} />
          <circle cx="60" cy="34" r="23" fill={url('glass')} stroke="#b9c9d8" strokeWidth="1.4" />
          <path d="M60 24 L60 34 M54 36 L60 42 L66 36" fill="none" stroke="#f0a52a" strokeWidth="2" strokeLinecap="round" />
          <path d="M53 45 Q60 50 67 45" fill="none" stroke="#c8871c" strokeWidth="1.6" />
          <rect x="49" y="54" width="22" height="8" rx="2" fill={url('metal')} />
          <path d="M49 62 h22 M49 66 h22 M50 70 h20" stroke="#7c8592" strokeWidth="2.4" />
          <rect x="52" y="72" width="16" height="6" rx="2" fill="#3b414a" />
          <text x="60" y="80" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.65">
            6 V · 3 W
          </text>
        </>
      );
      break;

    case 'switch':
      art = (
        <>
          {shadow}
          <rect x="26" y="40" width="68" height="26" rx="4" fill={url('metalH')} stroke="#4c545f" strokeWidth="1" />
          <rect x="30" y="43" width="60" height="7" rx="3" fill="#fff" opacity="0.22" />
          <circle cx="34" cy="53" r="3.4" fill="#39404a" />
          <circle cx="86" cy="53" r="3.4" fill="#39404a" />
          <line x1="38" y1="47" x2="76" y2="28" stroke="#78828f" strokeWidth="5" strokeLinecap="round" />
          <line x1="38" y1="46" x2="76" y2="27" stroke="#d7dee7" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="38" cy="48" r="5" fill={url('metal')} stroke="#5a626d" strokeWidth="0.8" />
          <line x1="34" y1="66" x2="34" y2="76" stroke={url('metal')} strokeWidth="2.4" />
          <line x1="86" y1="66" x2="86" y2="76" stroke={url('metal')} strokeWidth="2.4" />
          <text x="60" y="78" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.65">
            SPST
          </text>
        </>
      );
      break;

    case 'battery':
      art = (
        <>
          {shadow}
          <rect x="40" y="18" width="40" height="54" rx="5" fill={url('dark')} stroke="#0b0e12" strokeWidth="1" />
          <rect x="52" y="11" width="16" height="8" rx="2" fill={url('metal')} stroke="#6f7885" strokeWidth="0.8" />
          <rect x="42" y="24" width="36" height="40" rx="3" fill="#1f6f4a" opacity="0.55" />
          <rect x="44" y="26" width="8" height="36" rx="3" fill="#fff" opacity="0.14" />
          <text x="60" y="44" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#f3f7fb">
            1.5V
          </text>
          <text x="60" y="55" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="#cfe0d8">
            AA
          </text>
          <text x="88" y="24" fontSize="12" fill="currentColor" opacity="0.8">
            +
          </text>
        </>
      );
      break;

    case 'ground':
      art = (
        <>
          <line x1="16" y1="26" x2="54" y2="26" stroke="#2f6f4f" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M54 26 q10 0 10 10 v10" fill="none" stroke="#2f6f4f" strokeWidth="3" />
          <rect x="54" y="46" width="14" height="10" rx="2" fill={url('metal')} />
          <line x1="61" y1="56" x2="61" y2="76" stroke={url('copper')} strokeWidth="4" />
          <path d="M44 77 q17 -8 34 0" fill="#6b4a2f" opacity="0.7" />
          <ellipse cx="61" cy="78" rx="22" ry="4" fill="#000" opacity="0.18" />
          <text x="60" y="18" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.65">
            EARTH
          </text>
        </>
      );
      break;

    case 'dcMotor':
      art = (
        <>
          {shadow}
          <rect x="24" y="22" width="64" height="40" rx="10" fill={url('metalH')} stroke="#4f5864" strokeWidth="1.2" />
          <ellipse cx="88" cy="42" rx="7" ry="18" fill={url('metal')} stroke="#5a626d" strokeWidth="1" />
          <rect x="88" y="36" width="22" height="12" rx="2" fill={url('metal')} />
          <rect x="30" y="27" width="46" height="8" rx="4" fill="#fff" opacity="0.28" />
          <rect x="34" y="40" width="30" height="7" rx="2" fill="#2a3038" opacity="0.75" />
          <text x="49" y="46" fontSize="6" fontFamily="monospace" fill="#dbe4ee">
            DC 12V
          </text>
          <rect x="30" y="62" width="5" height="10" rx="1.5" fill="#39414b" />
          <rect x="40" y="62" width="5" height="10" rx="1.5" fill="#b23a3a" />
          <text x="60" y="80" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.65">
            3000 rpm
          </text>
        </>
      );
      break;

    case 'solenoid':
      art = (
        <>
          {shadow}
          <rect x="26" y="32" width="58" height="18" rx="4" fill="#d9c39b" stroke="#8a7350" strokeWidth="1" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ellipse
              key={i}
              cx={34 + i * 9}
              cy="41"
              rx="5"
              ry="11"
              fill="none"
              stroke={url('copper')}
              strokeWidth="3.2"
            />
          ))}
          <rect x="84" y="36" width="28" height="10" rx="2" fill={url('metal')} stroke="#5e6772" strokeWidth="0.8" />
          <line x1="84" y1="41" x2="36" y2="41" stroke="#8d7a5a" strokeWidth="1" opacity="0.6" />
          <line x1="28" y1="30" x2="20" y2="20" stroke={url('metal')} strokeWidth="2" />
          <line x1="28" y1="52" x2="20" y2="62" stroke={url('metal')} strokeWidth="2" />
          <text x="55" y="68" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.65">
            COIL
          </text>
        </>
      );
      break;

    case 'diode':
      art = (
        <>
          {shadow}
          <line x1="6" y1="42" x2="36" y2="42" stroke={url('metal')} strokeWidth="2.6" />
          <line x1="84" y1="42" x2="114" y2="42" stroke={url('metal')} strokeWidth="2.6" />
          <rect x="34" y="30" width="52" height="24" rx="5" fill={url('dark')} stroke="#0a0d11" strokeWidth="1" />
          <rect x="36" y="32" width="24" height="6" rx="3" fill="#fff" opacity="0.12" />
          <rect x="74" y="30" width="6" height="24" fill="#c9d2dc" />
          <text x="60" y="46" textAnchor="middle" fontSize="6.5" fontFamily="monospace" fill="#cfd8e3">
            1N4148
          </text>
          <text x="60" y="68" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.65">
            A → K
          </text>
        </>
      );
      break;

    case 'zenerDiode':
    case 'zener-diode':
      art = (
        <>
          {shadow}
          <line x1="6" y1="42" x2="36" y2="42" stroke={url('metal')} strokeWidth="2.6" />
          <line x1="84" y1="42" x2="114" y2="42" stroke={url('metal')} strokeWidth="2.6" />
          <rect x="34" y="29" width="52" height="26" rx="7" fill={url('amber')} stroke="#8c5512" strokeWidth="1.2" opacity="0.96" />
          <rect x="37" y="32" width="30" height="6" rx="3" fill="#fff" opacity="0.35" />
          <path d="M74 29 v26 M70 29 h8 l4 5 h-7" fill="none" stroke="#14181d" strokeWidth="2.2" strokeLinejoin="round" />
          <text x="58" y="47" textAnchor="middle" fontSize="7.5" fontFamily="monospace" fill="#3a2408">
            5V1
          </text>
          <text x="60" y="69" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.65">
            1N4733A
          </text>
        </>
      );
      break;

    case 'led':
      art = (
        <>
          <circle cx="60" cy="36" r="27" fill={url('glow')} opacity="0.85" />
          <path d="M43 46 v-10 a17 17 0 0 1 34 0 v10 z" fill={url('red')} stroke="#7d1010" strokeWidth="1" />
          <path
            d="M47 40 v-6 a13 13 0 0 1 26 0 v6"
            fill="none"
            stroke="#ffb3b3"
            strokeWidth="2"
            opacity="0.7"
          />
          <rect x="43" y="44" width="34" height="6" rx="2" fill="#a51b1b" />
          <path d="M54 50 v14 M66 50 v18" stroke={url('metal')} strokeWidth="2.4" />
          <path d="M57 52 l6 0 0 6" fill="none" stroke="#5b3a12" strokeWidth="1.4" opacity="0.7" />
          <text x="60" y="79" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.65">
            5 mm · RED
          </text>
        </>
      );
      break;

    case 'acVoltageSource':
      art = (
        <>
          {shadow}
          <rect x="20" y="18" width="80" height="50" rx="6" fill={url('metalH')} stroke="#4c545f" strokeWidth="1" />
          <rect x="28" y="25" width="42" height="24" rx="2" fill={url('screen')} stroke="#0a1f18" strokeWidth="1" />
          <path
            d="M32 38 q6 -9 12 0 t12 0 t12 0"
            fill="none"
            stroke="#48d99f"
            strokeWidth="1.4"
          />
          <text x="49" y="46" textAnchor="middle" fontSize="5.5" fontFamily="monospace" fill="#7ff0bf">
            50 Hz
          </text>
          <circle cx="84" cy="32" r="6.5" fill="#343b44" stroke="#8b95a2" strokeWidth="1.4" />
          <line x1="84" y1="32" x2="87" y2="27" stroke="#cfd8e3" strokeWidth="1.4" />
          <circle cx="84" cy="50" r="3.4" fill="#b23535" />
          <circle cx="96" cy="50" r="3.4" fill="#22262b" />
          <text x="60" y="62" textAnchor="middle" fontSize="6" fontFamily="monospace" fill="#e7eef7">
            AC SOURCE
          </text>
        </>
      );
      break;

    case 'currentSource':
      art = (
        <>
          {shadow}
          <rect x="20" y="18" width="80" height="50" rx="6" fill={url('metalH')} stroke="#4c545f" strokeWidth="1" />
          <rect x="28" y="24" width="46" height="18" rx="2" fill={url('screen')} stroke="#0a1f18" strokeWidth="1" />
          <text x="51" y="38" textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#7ff0bf">
            0.50 A
          </text>
          <circle cx="86" cy="30" r="6" fill="#343b44" stroke="#8b95a2" strokeWidth="1.2" />
          <circle cx="86" cy="46" r="4" fill="#b23535" />
          <circle cx="98" cy="46" r="4" fill="#22262b" />
          <text x="60" y="62" textAnchor="middle" fontSize="6" fontFamily="monospace" fill="#e7eef7">
            CURRENT SOURCE
          </text>
        </>
      );
      break;

    case 'acMotor':
      art = (
        <>
          {shadow}
          <rect x="26" y="20" width="56" height="42" rx="8" fill={url('metalH')} stroke="#4c545f" strokeWidth="1.2" />
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={i}
              x1={30 + i * 11}
              y1="22"
              x2={30 + i * 11}
              y2="60"
              stroke="#6d7682"
              strokeWidth="2"
            />
          ))}
          <ellipse cx="84" cy="41" rx="7" ry="16" fill={url('metal')} stroke="#59626d" strokeWidth="1" />
          <rect x="84" y="36" width="22" height="10" rx="2" fill={url('metal')} />
          <rect x="32" y="64" width="12" height="8" rx="2" fill="#3a414b" />
          <rect x="60" y="64" width="12" height="8" rx="2" fill="#3a414b" />
          <text x="52" y="52" textAnchor="middle" fontSize="6" fontFamily="monospace" fill="#e7eef7">
            AC MOTOR
          </text>
        </>
      );
      break;

    case 'bjtTransistor':
      art = (
        <>
          {shadow}
          <path
            d="M38 30 q22 -18 44 0 v18 q0 10 -10 10 h-24 q-10 0 -10 -10 z"
            fill={url('dark')}
            stroke="#0a0d11"
            strokeWidth="1.2"
          />
          <rect x="40" y="34" width="18" height="8" rx="4" fill="#fff" opacity="0.12" />
          <text x="60" y="46" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="#cfd8e3">
            2N2222
          </text>
          <path d="M48 58 v16 M60 58 v16 M72 58 v16" stroke={url('metal')} strokeWidth="2.2" />
          <path d="M48 74 h4 M60 74 h4 M72 74 h4" stroke="#b9c2cd" strokeWidth="1.4" />
          <text x="60" y="80" textAnchor="middle" fontSize="6" fontFamily="monospace" fill="currentColor" opacity="0.65">
            TO-92 · NPN
          </text>
        </>
      );
      break;

    default:
      art = shadow;
  }

  return (
    <svg
      viewBox="0 0 120 84"
      className="real-part-svg"
      role="img"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {commonDefs}
      {art}
    </svg>
  );
}
