import type { WahParams, WhammyParams } from '../../types/audio';

export type { WahParams, WhammyParams };
export interface DelayParams  { enabled: boolean; time: number; feedback: number; mix: number; }
export interface ReverbParams { enabled: boolean; mix: number; }
export interface ChorusParams { enabled: boolean; rate: number; depth: number; mix: number; }

function makeReverbIR(ctx: AudioContext): AudioBuffer {
  const sr  = ctx.sampleRate;
  const len = Math.floor(sr * 1.8);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
  }
  return buf;
}

/**
 * Post-cab effects chain: whammy → delay → reverb → chorus.
 * Wah is pre-amp and managed directly in AudioEngine.
 */
export class EffectsChain {
  readonly input:  GainNode;
  readonly output: GainNode;

  private _ctx: AudioContext;

  // Whammy (pitch shift)
  private _whammyNode: AudioWorkletNode | null = null;
  private _whammyDry:  GainNode;
  private _whammyWet:  GainNode;
  private _whammyIn:   GainNode;

  // Delay
  private _delayNode: DelayNode;
  private _delayFb:   GainNode;
  private _delayDry:  GainNode;
  private _delayWet:  GainNode;

  // Reverb
  private _reverbIn:  GainNode;
  private _reverb:    ConvolverNode;
  private _reverbDry: GainNode;
  private _reverbWet: GainNode;

  // Chorus
  private _chorusIn:    GainNode;
  private _chorusDelay: DelayNode;
  private _chorusLfo:   OscillatorNode;
  private _chorusLfoG:  GainNode;
  private _chorusDry:   GainNode;
  private _chorusWet:   GainNode;

  constructor(ctx: AudioContext) {
    this._ctx   = ctx;
    this.input  = ctx.createGain();
    this.output = ctx.createGain();

    // ---- Whammy (AudioWorkletNode loaded lazily) -------------------------
    this._whammyIn  = ctx.createGain();
    this._whammyDry = ctx.createGain(); this._whammyDry.gain.value = 1;
    this._whammyWet = ctx.createGain(); this._whammyWet.gain.value = 0;

    this.input.connect(this._whammyIn);
    this._whammyIn.connect(this._whammyDry);
    // _whammyNode connected when worklet loads

    // ---- Delay -----------------------------------------------------------
    this._delayNode = ctx.createDelay(2.0);
    this._delayNode.delayTime.value = 0.3;
    this._delayFb  = ctx.createGain(); this._delayFb.gain.value  = 0.35;
    this._delayDry = ctx.createGain(); this._delayDry.gain.value = 1;
    this._delayWet = ctx.createGain(); this._delayWet.gain.value = 0;

    this._whammyDry.connect(this._delayDry);
    this._whammyDry.connect(this._delayNode);
    this._delayNode.connect(this._delayFb);
    this._delayFb.connect(this._delayNode);
    this._delayNode.connect(this._delayWet);

    // ---- Reverb ----------------------------------------------------------
    this._reverbIn  = ctx.createGain();
    this._reverb    = ctx.createConvolver();
    this._reverb.normalize = true;
    this._reverb.buffer    = makeReverbIR(ctx);
    this._reverbDry = ctx.createGain(); this._reverbDry.gain.value = 1;
    this._reverbWet = ctx.createGain(); this._reverbWet.gain.value = 0;

    this._delayDry.connect(this._reverbIn);
    this._delayWet.connect(this._reverbIn);
    this._reverbIn.connect(this._reverbDry);
    this._reverbIn.connect(this._reverb);
    this._reverb.connect(this._reverbWet);

    // ---- Chorus ----------------------------------------------------------
    this._chorusIn    = ctx.createGain();
    this._chorusDelay = ctx.createDelay(0.05);
    this._chorusDelay.delayTime.value = 0.012;
    this._chorusLfo   = ctx.createOscillator();
    this._chorusLfo.type            = 'sine';
    this._chorusLfo.frequency.value = 1.5;
    this._chorusLfoG  = ctx.createGain();
    this._chorusLfoG.gain.value     = 0.005;
    this._chorusDry   = ctx.createGain(); this._chorusDry.gain.value = 1;
    this._chorusWet   = ctx.createGain(); this._chorusWet.gain.value = 0;

    this._chorusLfo.connect(this._chorusLfoG);
    this._chorusLfoG.connect(this._chorusDelay.delayTime);
    this._chorusLfo.start();

    this._reverbDry.connect(this._chorusIn);
    this._reverbWet.connect(this._chorusIn);
    this._chorusIn.connect(this._chorusDry);
    this._chorusIn.connect(this._chorusDelay);
    this._chorusDelay.connect(this._chorusWet);

    this._chorusDry.connect(this.output);
    this._chorusWet.connect(this.output);
  }

  /** Call after AudioWorklet module is loaded */
  initWhammy(): void {
    try {
      this._whammyNode = new AudioWorkletNode(this._ctx, 'whammy-processor');
      this._whammyIn.connect(this._whammyNode);
      this._whammyNode.connect(this._whammyWet);
      this._whammyWet.connect(this._delayDry);
      this._whammyWet.connect(this._delayNode);
    } catch {
      // Worklet not available — whammy dry path still works
    }
  }

  // ---- Parameter setters -------------------------------------------------

  setWhammy({ enabled, semitones, expression, mix }: WhammyParams): void {
    const t       = this._ctx.currentTime;
    const node    = this._whammyNode;
    const actual  = semitones * (expression ?? 0);
    if (node) {
      (node.parameters as AudioParamMap).get('semitones')?.setTargetAtTime(actual, t, 0.02);
      (node.parameters as AudioParamMap).get('mix')?.setTargetAtTime(1, t, 0.02);
    }
    this._whammyWet.gain.setTargetAtTime(enabled && node ? mix     : 0, t, 0.02);
    this._whammyDry.gain.setTargetAtTime(enabled && node ? 1 - mix : 1, t, 0.02);
  }

  setDelay({ enabled, time, feedback, mix }: DelayParams): void {
    const t = this._ctx.currentTime;
    this._delayNode.delayTime.setTargetAtTime(time, t, 0.02);
    this._delayFb.gain.setTargetAtTime(feedback, t, 0.02);
    this._delayWet.gain.setTargetAtTime(enabled ? mix     : 0, t, 0.02);
    this._delayDry.gain.setTargetAtTime(enabled ? 1 - mix : 1, t, 0.02);
  }

  setReverb({ enabled, mix }: ReverbParams): void {
    const t = this._ctx.currentTime;
    this._reverbWet.gain.setTargetAtTime(enabled ? mix     : 0, t, 0.02);
    this._reverbDry.gain.setTargetAtTime(enabled ? 1 - mix : 1, t, 0.02);
  }

  setChorus({ enabled, rate, depth, mix }: ChorusParams): void {
    const t = this._ctx.currentTime;
    this._chorusLfo.frequency.setTargetAtTime(rate, t, 0.1);
    this._chorusLfoG.gain.setTargetAtTime(depth, t, 0.1);
    this._chorusWet.gain.setTargetAtTime(enabled ? mix     : 0, t, 0.02);
    this._chorusDry.gain.setTargetAtTime(enabled ? 1 - mix : 1, t, 0.02);
  }

  dispose(): void {
    this._chorusLfo.stop();

    this.input.disconnect();
    this._whammyIn.disconnect();
    this._whammyDry.disconnect();
    this._whammyWet.disconnect();
    this._whammyNode?.disconnect();
    this._delayNode.disconnect();
    this._delayFb.disconnect();
    this._delayDry.disconnect();
    this._delayWet.disconnect();
    this._reverbIn.disconnect();
    this._reverb.disconnect();
    this._reverbDry.disconnect();
    this._reverbWet.disconnect();
    this._chorusIn.disconnect();
    this._chorusDelay.disconnect();
    this._chorusLfo.disconnect();
    this._chorusLfoG.disconnect();
    this._chorusDry.disconnect();
    this._chorusWet.disconnect();
    this.output.disconnect();
  }
}
