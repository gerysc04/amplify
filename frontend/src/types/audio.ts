// Matches the param types exported from AudioEngine.ts / EffectsChain.ts

export interface Preset {
  id:        string;
  name:      string;
  createdAt: number;
  namModel:  { filename: string; available: boolean };
  cabIR:     { filename: string; available: boolean };
  gain:      number;
  gate:      { enabled: boolean; threshold: number; attack: number; release: number };
  eq:        { bass: number; mid: number; treble: number };
  delay:     { enabled: boolean; time: number; feedback: number; mix: number };
  reverb:    { enabled: boolean; mix: number };
  chorus:    { enabled: boolean; rate: number; depth: number; mix: number };
}
