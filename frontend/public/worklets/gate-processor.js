/**
 * Noise gate AudioWorklet.
 * RMS envelope follower → hard gate with smoothed open/close transitions.
 *
 * The envelope follower uses fast, fixed attack/release so it tracks the
 * signal level accurately. The gate gain uses the user-supplied attack/release
 * for smooth, click-free open/close transitions.
 */

class GateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._threshold    = 0.02; // linear amplitude

    // Envelope follower — fast, fixed times for accurate level tracking
    this._envAttackCoeff  = Math.exp(-1 / (0.0005 * sampleRate));
    this._envReleaseCoeff = Math.exp(-1 / (0.010  * sampleRate));

    // Gate gain smoothing — user-configured attack / release
    this._gateAttackCoeff  = Math.exp(-1 / (0.003 * sampleRate));
    this._gateReleaseCoeff = Math.exp(-1 / (0.15  * sampleRate));

    this._env  = 0;
    this._gain = 0;
    this._enabled = true;

    this.port.onmessage = ({ data }) => {
      if (data.type !== 'params') return;
      const { threshold, attack, release, enabled } = data;
      if (threshold !== undefined) this._threshold         = threshold;
      if (attack    !== undefined) this._gateAttackCoeff   = Math.exp(-1 / (attack  * sampleRate));
      if (release   !== undefined) this._gateReleaseCoeff  = Math.exp(-1 / (release * sampleRate));
      if (enabled   !== undefined) this._enabled           = enabled;
    };
  }

  process(inputs, outputs) {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (!inp || !out) return true;

    if (!this._enabled) { out.set(inp); return true; }

    for (let n = 0; n < inp.length; n++) {
      const abs = Math.abs(inp[n]);
      // Envelope follower: fast attack, medium release
      this._env = abs > this._env
        ? this._envAttackCoeff  * this._env + (1 - this._envAttackCoeff)  * abs
        : this._envReleaseCoeff * this._env + (1 - this._envReleaseCoeff) * abs;

      // Smooth gate gain
      const target = this._env > this._threshold ? 1 : 0;
      const coeff  = target > this._gain ? this._gateAttackCoeff : this._gateReleaseCoeff;
      this._gain   = coeff * this._gain + (1 - coeff) * target;

      out[n] = inp[n] * this._gain;
    }
    return true;
  }
}

registerProcessor('gate-processor', GateProcessor);
