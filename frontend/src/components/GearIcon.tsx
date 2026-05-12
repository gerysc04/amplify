interface Props { size?: number; color?: string }
const c = (color?: string) => color ?? '#3a3a3a';
const s = (color?: string) => color ? `${color}88` : '#2a2a2a';

export function AmpIcon({ size = 80, color }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* chassis */}
      <rect x="8" y="28" width="84" height="52" rx="4" fill="#161616" stroke={c(color)} strokeWidth="1.5"/>
      {/* top strip */}
      <rect x="8" y="20" width="84" height="12" rx="3" fill="#1a1a1a" stroke={c(color)} strokeWidth="1.5"/>
      {/* input jack */}
      <circle cx="18" cy="26" r="3.5" fill={s(color)} stroke={c(color)} strokeWidth="1"/>
      {/* 3 knobs */}
      <circle cx="30" cy="50" r="8" fill="#1a1a1a" stroke={c(color)} strokeWidth="1.5"/>
      <line x1="30" y1="50" x2="30" y2="43" stroke={c(color)} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="50" cy="50" r="8" fill="#1a1a1a" stroke={c(color)} strokeWidth="1.5"/>
      <line x1="50" y1="50" x2="54" y2="44" stroke={c(color)} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="70" cy="50" r="8" fill="#1a1a1a" stroke={c(color)} strokeWidth="1.5"/>
      <line x1="70" y1="50" x2="76" y2="46" stroke={c(color)} strokeWidth="1.5" strokeLinecap="round"/>
      {/* power LED */}
      <circle cx="85" cy="36" r="3" fill={s(color)} stroke={c(color)} strokeWidth="1"/>
      {/* vent slots */}
      <line x1="30" y1="68" x2="70" y2="68" stroke={c(color)} strokeWidth="1" opacity="0.5"/>
      <line x1="30" y1="72" x2="70" y2="72" stroke={c(color)} strokeWidth="1" opacity="0.5"/>
      <line x1="30" y1="76" x2="70" y2="76" stroke={c(color)} strokeWidth="1" opacity="0.5"/>
    </svg>
  );
}

export function FullRigIcon({ size = 80, color }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* amp head */}
      <rect x="12" y="8" width="76" height="30" rx="3" fill="#161616" stroke={c(color)} strokeWidth="1.5"/>
      <circle cx="28" cy="23" r="5" fill="#1a1a1a" stroke={c(color)} strokeWidth="1.2"/>
      <line x1="28" y1="23" x2="28" y2="18.5" stroke={c(color)} strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="44" cy="23" r="5" fill="#1a1a1a" stroke={c(color)} strokeWidth="1.2"/>
      <line x1="44" y1="23" x2="47" y2="19" stroke={c(color)} strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="60" cy="23" r="5" fill="#1a1a1a" stroke={c(color)} strokeWidth="1.2"/>
      <line x1="60" y1="23" x2="64" y2="20" stroke={c(color)} strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="80" cy="16" r="2.5" fill={s(color)} stroke={c(color)} strokeWidth="1"/>
      {/* cab */}
      <rect x="8" y="44" width="84" height="50" rx="4" fill="#111" stroke={c(color)} strokeWidth="1.5"/>
      {/* grille cloth */}
      <rect x="14" y="50" width="72" height="38" rx="2" fill="#141414" stroke={c(color)} strokeWidth="1" opacity="0.6"/>
      {/* two speakers */}
      <circle cx="36" cy="69" r="14" fill="none" stroke={c(color)} strokeWidth="1.2"/>
      <circle cx="36" cy="69" r="8"  fill="none" stroke={c(color)} strokeWidth="1"  opacity="0.6"/>
      <circle cx="36" cy="69" r="3"  fill={s(color)}/>
      <circle cx="64" cy="69" r="14" fill="none" stroke={c(color)} strokeWidth="1.2"/>
      <circle cx="64" cy="69" r="8"  fill="none" stroke={c(color)} strokeWidth="1"  opacity="0.6"/>
      <circle cx="64" cy="69" r="3"  fill={s(color)}/>
    </svg>
  );
}

export function IrIcon({ size = 80, color }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* cabinet */}
      <rect x="10" y="10" width="80" height="80" rx="5" fill="#111" stroke={c(color)} strokeWidth="1.5"/>
      {/* grille */}
      <rect x="16" y="16" width="68" height="68" rx="3" fill="#141414" stroke={c(color)} strokeWidth="1" opacity="0.6"/>
      {/* speaker rings */}
      <circle cx="50" cy="50" r="28" fill="none" stroke={c(color)} strokeWidth="1.5"/>
      <circle cx="50" cy="50" r="20" fill="none" stroke={c(color)} strokeWidth="1.2" opacity="0.7"/>
      <circle cx="50" cy="50" r="12" fill="none" stroke={c(color)} strokeWidth="1"   opacity="0.5"/>
      <circle cx="50" cy="50" r="5"  fill="#1a1a1a" stroke={c(color)} strokeWidth="1.2"/>
      <circle cx="50" cy="50" r="2"  fill={s(color)}/>
      {/* mounting screws */}
      <circle cx="22" cy="22" r="2.5" fill="#1a1a1a" stroke={c(color)} strokeWidth="1"/>
      <circle cx="78" cy="22" r="2.5" fill="#1a1a1a" stroke={c(color)} strokeWidth="1"/>
      <circle cx="22" cy="78" r="2.5" fill="#1a1a1a" stroke={c(color)} strokeWidth="1"/>
      <circle cx="78" cy="78" r="2.5" fill="#1a1a1a" stroke={c(color)} strokeWidth="1"/>
    </svg>
  );
}

export function PedalIcon({ size = 80, color }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* body */}
      <rect x="22" y="10" width="56" height="80" rx="8" fill="#161616" stroke={c(color)} strokeWidth="1.5"/>
      {/* input/output jacks (sides) */}
      <rect x="10" y="28" width="12" height="6" rx="3" fill="#1a1a1a" stroke={c(color)} strokeWidth="1"/>
      <rect x="78" y="28" width="12" height="6" rx="3" fill="#1a1a1a" stroke={c(color)} strokeWidth="1"/>
      {/* knob row */}
      <circle cx="38" cy="35" r="7" fill="#1a1a1a" stroke={c(color)} strokeWidth="1.5"/>
      <line x1="38" y1="35" x2="38" y2="29" stroke={c(color)} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="62" cy="35" r="7" fill="#1a1a1a" stroke={c(color)} strokeWidth="1.5"/>
      <line x1="62" y1="35" x2="65" y2="30" stroke={c(color)} strokeWidth="1.5" strokeLinecap="round"/>
      {/* LED */}
      <circle cx="50" cy="52" r="4" fill={s(color)} stroke={c(color)} strokeWidth="1"/>
      {/* footswitch */}
      <circle cx="50" cy="72" r="13" fill="#1a1a1a" stroke={c(color)} strokeWidth="1.5"/>
      <circle cx="50" cy="72" r="8"  fill="#161616" stroke={c(color)} strokeWidth="1" opacity="0.7"/>
    </svg>
  );
}

export function GearIcon({ type, size = 80, color }: Props & { type: string }) {
  switch (type) {
    case 'full-rig': return <FullRigIcon size={size} color={color} />;
    case 'ir':       return <IrIcon      size={size} color={color} />;
    case 'pedal':    return <PedalIcon   size={size} color={color} />;
    default:         return <AmpIcon     size={size} color={color} />;
  }
}
