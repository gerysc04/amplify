/**
 * Basic pitch shifter using a two-tap cross-fading ring buffer.
 * Phase 9 will replace this with a Rust/WASM phase-vocoder implementation.
 */
class WhammyProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'semitones', defaultValue: 0,  minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'mix',       defaultValue: 1,  minValue:   0, maxValue:  1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this._N      = 8192;
    this._grain  = 1024;
    this._buf    = new Float32Array(this._N);
    // Pre-offset write/read so indices are always positive
    this._wPos   = this._grain * 4;
    this._rPos   = this._grain * 2;
    this._rPos2  = this._grain;
    this._gPos   = 0;
  }

  _idx(pos) {
    return ((Math.floor(pos) % this._N) + this._N) % this._N;
  }

  process(inputs, outputs, parameters) {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (!inp || !out) return true;

    const semitones   = parameters.semitones[0] ?? 0;
    const mix         = parameters.mix[0]       ?? 1;
    const pitchFactor = Math.pow(2, semitones / 12);
    const N = this._N;

    for (let i = 0; i < inp.length; i++) {
      // Write current sample
      this._buf[this._idx(this._wPos)] = inp[i];
      this._wPos++;

      // Two read heads with Hann cross-fade
      const phase = this._gPos / this._grain;
      const w1 = 0.5 - 0.5 * Math.cos(Math.PI * phase);
      const w2 = 0.5 - 0.5 * Math.cos(Math.PI * (phase + 1));

      const s1 = this._buf[this._idx(this._rPos)];
      const s2 = this._buf[this._idx(this._rPos2)];
      const pitched = s1 * w1 + s2 * w2;

      this._rPos  += pitchFactor;
      this._rPos2 += pitchFactor;
      this._gPos   = (this._gPos + 1) % this._grain;

      // Reset second head at grain boundary
      if (this._gPos === 0) {
        this._rPos2 = this._rPos - this._grain / 2;
      }

      // Keep read heads from drifting too close or too far from write
      const dist = this._wPos - this._rPos;
      if (dist < this._grain || dist > N - this._grain * 2) {
        this._rPos  = this._wPos - this._grain * 2;
        this._rPos2 = this._rPos - this._grain / 2;
        this._gPos  = 0;
      }

      out[i] = inp[i] * (1 - mix) + pitched * mix;
    }

    return true;
  }
}

registerProcessor('whammy-processor', WhammyProcessor);
