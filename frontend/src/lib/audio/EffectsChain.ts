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
 * Post-cab effects: delay → reverb → chorus (series, each with wet/dry mix).
 * Connect: source → this.input … this.output → destination.
 */
export class EffectsChain {
  readonly input:  GainNode;
  readonly output: GainNode;

  private _ctx: AudioContext;

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

    // ---- Delay --------------------------------------------------------
    this._delayNode = ctx.createDelay(2.0);
    this._delayNode.delayTime.value = 0.3;
    this._delayFb  = ctx.createGain(); this._delayFb.gain.value  = 0.35;
    this._delayDry = ctx.createGain(); this._delayDry.gain.value = 1;
    this._delayWet = ctx.createGain(); this._delayWet.gain.value = 0;

    this.input.connect(this._delayDry);
    this.input.connect(this._delayNode);
    this._delayNode.connect(this._delayFb);
    this._delayFb.connect(this._delayNode); // feedback loop (Web Audio allows cycles with delay)
    this._delayNode.connect(this._delayWet);

    // ---- Reverb -------------------------------------------------------
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

    // ---- Chorus -------------------------------------------------------
    this._chorusIn    = ctx.createGain();
    this._chorusDelay = ctx.createDelay(0.05);
    this._chorusDelay.delayTime.value = 0.012;
    this._chorusLfo   = ctx.createOscillator();
    this._chorusLfo.type             = 'sine';
    this._chorusLfo.frequency.value  = 1.5;
    this._chorusLfoG  = ctx.createGain();
    this._chorusLfoG.gain.value      = 0.005; // ±5 ms
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

  // ---- Parameter setters -----------------------------------------------

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
  }
}
