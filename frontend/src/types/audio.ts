export interface ToneRef {
  filename:  string;
  available: boolean;
  toneId?:   number;
  title?:    string;
  imageUrl?: string;
  gearType?: string;
}

export interface Preset {
  id:        string;
  name:      string;
  createdAt: number;
  namModel:  ToneRef;
  cabIR:     ToneRef;
  gain:      number;
  gate:      { enabled: boolean; threshold: number; attack: number; release: number };
  eq:        { bass: number; mid: number; treble: number };
  delay:     { enabled: boolean; time: number; feedback: number; mix: number };
  reverb:    { enabled: boolean; mix: number };
  chorus:    { enabled: boolean; rate: number; depth: number; mix: number };
}
