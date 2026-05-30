// ---- MIDI ---------------------------------------------------------------

export type MidiActionType = 'load_preset' | 'toggle' | 'set_param';
export type ToggleTarget =
  | 'gate' | 'compressor' | 'delay' | 'reverb' | 'chorus' | 'wah' | 'whammy';

export type ParamTarget =
  | 'gain' | 'volume'
  | 'gate.threshold'
  | 'eq.bass' | 'eq.mid' | 'eq.treble'
  | 'compressor.threshold' | 'compressor.ratio' | 'compressor.attack' | 'compressor.release' | 'compressor.knee'
  | 'delay.time' | 'delay.feedback' | 'delay.mix'
  | 'reverb.mix'
  | 'chorus.rate' | 'chorus.depth' | 'chorus.mix'
  | 'wah.frequency'
  | 'whammy.semitones'
  | 'whammy.expression'
  | 'transpose.semitones'
  | 'parametricEq.band0.freq' | 'parametricEq.band0.gain' | 'parametricEq.band0.q'
  | 'parametricEq.band1.freq' | 'parametricEq.band1.gain' | 'parametricEq.band1.q'
  | 'parametricEq.band2.freq' | 'parametricEq.band2.gain' | 'parametricEq.band2.q'
  | 'parametricEq.band3.freq' | 'parametricEq.band3.gain' | 'parametricEq.band3.q'
  | 'parametricEq.band4.freq' | 'parametricEq.band4.gain' | 'parametricEq.band4.q'
  | 'parametricEq.band5.freq' | 'parametricEq.band5.gain' | 'parametricEq.band5.q'
  | 'parametricEq.band6.freq' | 'parametricEq.band6.gain' | 'parametricEq.band6.q'
  | 'parametricEq.band7.freq' | 'parametricEq.band7.gain' | 'parametricEq.band7.q';

export type MidiAction =
  | { type: 'load_preset'; preset_id: string; preset_name?: string }
  | { type: 'toggle';      target: ToggleTarget }
  | { type: 'set_param';   target: ParamTarget; min: number; max: number };

export interface MidiMapping {
  id:      string;
  cc:      number;
  channel: number;   // 0 = any channel
  action:  MidiAction;
}

export interface MidiSetup {
  id:        string;
  name:      string;
  is_active: boolean;
  mappings:  MidiMapping[];
}

// ---- Audio effects params -----------------------------------------------

export interface WahParams {
  enabled:   boolean;
  frequency: number;   // 0–1 → 200–3000 Hz
  q:         number;   // resonance (default 5)
}

export interface CompressorParams {
  enabled:   boolean;
  threshold: number;   // dB (-40 to 0)
  ratio:     number;   // 1 to 20
  attack:    number;   // seconds (0.001 to 0.1)
  release:   number;   // seconds (0.01 to 1.0)
  knee:      number;   // dB (0 to 12)
}

export interface TransposeParams {
  semitones: number;   // integer −24 to +24, 0 = bypass
}

// Whammy mode: pedal heel=0st, toe=target semitones
export type WhammyMode =
  | '+2oct' | '+1oct' | '+5th' | '+4th' | '+3rd' | '+2nd'
  | '-2nd'  | '-3rd'  | '-4th' | '-5th' | '-1oct'| '-2oct'
  | 'custom';

export const WHAMMY_MODES: { value: WhammyMode; label: string; semitones: number }[] = [
  { value: '+2oct', label: '+2 Octaves', semitones:  24 },
  { value: '+1oct', label: '+1 Octave',  semitones:  12 },
  { value: '+5th',  label: '+5th',       semitones:   7 },
  { value: '+4th',  label: '+4th',       semitones:   5 },
  { value: '+3rd',  label: '+3rd',       semitones:   4 },
  { value: '+2nd',  label: '+2nd',       semitones:   2 },
  { value: '-2nd',  label: '-2nd',       semitones:  -2 },
  { value: '-3rd',  label: '-3rd',       semitones:  -4 },
  { value: '-4th',  label: '-4th',       semitones:  -5 },
  { value: '-5th',  label: '-5th',       semitones:  -7 },
  { value: '-1oct', label: '-1 Octave',  semitones: -12 },
  { value: '-2oct', label: '-2 Octaves', semitones: -24 },
  { value: 'custom',label: 'Custom',     semitones:   0 },
];

export interface WhammyParams {
  enabled:    boolean;
  mode:       WhammyMode;
  semitones:  number;   // target at toe-down (set by mode)
  expression: number;   // 0=heel(no shift) → 1=toe(full shift), driven by expression CC
  mix:        number;
}

export type ParametricEqType = 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass';

export interface ParametricEqBand {
  enabled: boolean;
  type: ParametricEqType;
  frequency: number;  // Hz, 20–20000
  gain: number;       // dB, -18 to +18
  q: number;          // 0.1 to 10
}

// ---- Preset -------------------------------------------------------------

export interface ToneRef {
  filename:  string;
  available: boolean;
  toneId?:   number;
  title?:    string;
  imageUrl?: string;
  gearType?: string;
}

export interface PedalSlot {
  id:        string;      // client-side uuid
  toneId:    number;
  title:     string;
  filename:  string;
  gearType:  string;
  imageUrl?: string;
  enabled:   boolean;
}

export interface Preset {
  id:        string;
  name:      string;
  createdAt: number;
  namModel:  ToneRef;
  cabIR:     ToneRef;
  gain:      number;
  volume:    number;
  gate:      { enabled: boolean; threshold: number; attack: number; release: number };
  eq:        { bass: number; mid: number; treble: number };
  transpose: TransposeParams;
  wah:       WahParams;
  whammy:    WhammyParams;
  compressor: CompressorParams;
  delay:     { enabled: boolean; time: number; feedback: number; mix: number };
  reverb:    { enabled: boolean; mix: number };
  chorus:    { enabled: boolean; rate: number; depth: number; mix: number };
  tunerEnabled: boolean;
  parametricEq: ParametricEqBand[];
  pedals:    PedalSlot[];
}
