export interface NamModelInfo {
  filename: string;
  source: 'bundled' | 'uploaded' | 'indexeddb';
  available: boolean;
}

export interface CabIRInfo {
  filename: string;
  source: 'bundled' | 'uploaded';
}

export interface AmpParams {
  gain: number;     // 0–1
  bass: number;
  mid: number;
  treble: number;
  presence: number;
  volume: number;
}

export interface GateParams {
  enabled: boolean;
  threshold: number; // dBFS
  attack: number;    // ms
  release: number;   // ms
}

export interface EQParams {
  enabled: boolean;
  bass: number;
  mid: number;
  treble: number;
}

export interface DelayParams {
  enabled: boolean;
  time: number;      // ms
  feedback: number;  // 0–1
  mix: number;       // 0–1
}

export interface ReverbParams {
  enabled: boolean;
  mix: number;       // 0–1
}

export interface ChorusParams {
  enabled: boolean;
  rate: number;      // Hz
  depth: number;     // 0–1
  mix: number;       // 0–1
}

export interface Preset {
  id: string;
  name: string;
  namModel: NamModelInfo;
  cabIR: CabIRInfo;
  amp: AmpParams;
  gate: GateParams;
  eq: EQParams;
  delay: DelayParams;
  reverb: ReverbParams;
  chorus: ChorusParams;
}
