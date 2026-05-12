/**
 * Soft-knee dynamics compressor AudioWorklet.
 *
 * Operates in the dB domain for accurate threshold/ratio/knee behavior.
 * Envelope follower with separate attack/release smoothing on the gain
 * reduction (not the signal level) for natural, click-free compression.
 */

class CompressorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._thresholdDb = -20;   // dB
    this._ratio = 4;           // N:1
    this._attack = 0.003;      // seconds
    this._release = 0.15;      // seconds
    this._kneeDb = 3;          // dB soft-knee width
    this._enabled = true;
    this._env = 0;             // linear envelope
    this._gr = 0;              // current gain reduction in dB

    this.port.onmessage = ({ data }) => {
      if (data.type !== 'params') return;
      const { threshold, ratio, attack, release, knee, enabled } = data;
      if (threshold !== undefined) this._thresholdDb = threshold;
      if (ratio    !== undefined) this._ratio = Math.max(ratio, 1);
      if (attack   !== undefined) this._attack = attack;
      if (release  !== undefined) this._release = release;
      if (knee     !== undefined) this._kneeDb = knee;
      if (enabled  !== undefined) this._enabled = enabled;
    };
  }

  process(inputs, outputs) {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (!inp || !out) return true;

    if (!this._enabled) { out.set(inp); return true; }

    const attackCoeff  = Math.exp(-1 / (this._attack  * sampleRate));
    const releaseCoeff = Math.exp(-1 / (this._release * sampleRate));
    const thresh = this._thresholdDb;
    const kneeHalf = this._kneeDb / 2;

    for (let n = 0; n < inp.length; n++) {
      const abs = Math.abs(inp[n]);

      // Envelope follower (fast attack, slower release)
      const envCoeff = abs > this._env ? attackCoeff : releaseCoeff;
      this._env = envCoeff * this._env + (1 - envCoeff) * abs;

      // Convert envelope to dB (avoid log(0))
      const levelDb = 20 * Math.log10(Math.max(this._env, 1e-10));

      // Compute gain reduction (dB) with soft knee
      let reductionDb = 0;
      if (levelDb > thresh - kneeHalf) {
        if (levelDb < thresh + kneeHalf) {
          // Inside knee — smooth quadratic transition
          const delta = levelDb - (thresh - kneeHalf);
          reductionDb = (delta * delta) / (2 * this._kneeDb) * (1 - 1 / this._ratio);
        } else {
          // Above knee — full compression
          reductionDb = (thresh - levelDb) * (1 - 1 / this._ratio);
        }
      }

      // Smooth gain reduction (separate attack/release)
      const grCoeff = reductionDb > this._gr ? attackCoeff : releaseCoeff;
      this._gr = grCoeff * this._gr + (1 - grCoeff) * reductionDb;

      // Apply gain
      out[n] = inp[n] * Math.pow(10, this._gr / 20);
    }

    return true;
  }
}

registerProcessor('compressor-processor', CompressorProcessor);
