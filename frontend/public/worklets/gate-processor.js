/**
 * Noise gate AudioWorklet.
 * RMS envelope follower → hard gate with smoothed open/close transitions.
 */

class GateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._threshold    = 0.02; // linear amplitude
    this._attackCoeff  = Math.exp(-1 / (0.003 * sampleRate));
    this._releaseCoeff = Math.exp(-1 / (0.15  * sampleRate));
    this._env  = 0;
    this._gain = 0;
    this._enabled = true;

    this.port.onmessage = ({ data }) => {
      if (data.type !== 'params') return;
      const { threshold, attack, release, enabled } = data;
      if (threshold !== undefined) this._threshold   = threshold;
      if (attack    !== undefined) this._attackCoeff  = Math.exp(-1 / (attack  * sampleRate));
      if (release   !== undefined) this._releaseCoeff = Math.exp(-1 / (release * sampleRate));
      if (enabled   !== undefined) this._enabled      = enabled;
    };
  }

  process(inputs, outputs) {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (!inp || !out) return true;

    if (!this._enabled) { out.set(inp); return true; }

    for (let n = 0; n < inp.length; n++) {
      const abs = Math.abs(inp[n]);
      // Envelope follower: fast attack, slow release
      this._env = abs > this._env
        ? this._attackCoeff  * this._env + (1 - this._attackCoeff)  * abs
        : this._releaseCoeff * this._env + (1 - this._releaseCoeff) * abs;

      // Smooth gate gain
      const target = this._env > this._threshold ? 1 : 0;
      const coeff  = target > this._gain ? this._attackCoeff : this._releaseCoeff;
      this._gain   = coeff * this._gain + (1 - coeff) * target;

      out[n] = inp[n] * this._gain;
    }
    return true;
  }
}

registerProcessor('gate-processor', GateProcessor);
