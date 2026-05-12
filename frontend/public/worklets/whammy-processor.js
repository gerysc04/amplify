/**
 * Two-tap OLA pitch shifter with linear interpolation and smooth drift correction.
 *
 * Improvements over the original:
 * - Smaller grain (512) and buffer (4096) → lower latency (~21 ms wet at 48 kHz)
 * - Linear interpolation when reading from the ring buffer → no zipper noise
 * - Proper Hann windows (0 → 1 → 0) → smoother cross-fades
 * - Servo-based drift correction → no abrupt click/pop resets for normal shifts
 * - Hard safety reset only when a read head is critically close to the write head
 */
class WhammyProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'semitones', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    // Grain and buffer sizes (power-of-two for fast wrap)
    this._grain = 512;
    this._N = 4096;
    this._buf = new Float32Array(this._N);

    this._wPos = 0;
    this._rPos = 0;
    this._rPos2 = 0;
    this._gPos = 0;
    this._initialized = false;

    this._lastSemitones = 0;
  }

  /** Wrap index into [0, N) for positive and negative values. */
  _idx(pos) {
    let p = Math.floor(pos);
    p %= this._N;
    if (p < 0) p += this._N;
    return p;
  }

  /** Read from ring buffer with linear interpolation. */
  _read(pos) {
    const i = Math.floor(pos);
    const f = pos - i;
    const i0 = this._idx(i);
    const i1 = this._idx(i + 1);
    return this._buf[i0] + f * (this._buf[i1] - this._buf[i0]);
  }

  process(inputs, outputs, parameters) {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (!inp || !out) return true;

    const semitones = parameters.semitones[0] ?? 0;
    const mix = parameters.mix[0] ?? 1;

    // Fast path: no pitch shift, just pass through and keep buffer warm
    if (semitones === 0) {
      for (let i = 0; i < inp.length; i++) {
        this._buf[this._idx(this._wPos)] = inp[i];
        this._wPos++;
        out[i] = inp[i];
      }
      this._initialized = false; // re-init read heads when shift starts
      this._lastSemitones = 0;
      return true;
    }

    const pitchFactor = Math.pow(2, semitones / 12);
    const N = this._N;
    const grain = this._grain;

    // Target latency behind write head. 1024 samples ≈ 21 ms @ 48 kHz.
    // This is a compromise: low enough to feel responsive, high enough to
    // survive a few grains at moderate pitch shifts before a safety reset.
    const targetLatency = grain * 2;

    // Servo gain: gentle correction so speed wobbles are inaudible.
    const alpha = 0.0005;

    // If semitones just went from 0 → non-zero, (re-)position read heads.
    if (!this._initialized || this._lastSemitones === 0) {
      this._rPos = this._wPos - targetLatency;
      this._rPos2 = this._rPos - grain * 0.5;
      this._gPos = 0;
      this._initialized = true;
    }
    this._lastSemitones = semitones;

    // Safety margin: if a read head gets within this many samples of the write
    // head it will be hard-reset on the next sample.  This only triggers for
    // extreme pitch shifts (e.g. +24 st) where the servo cannot keep up.
    const minSafe = grain;
    const maxSafe = N - grain * 2;

    for (let i = 0; i < inp.length; i++) {
      // ---- write ----------------------------------------------------------
      this._buf[this._idx(this._wPos)] = inp[i];
      this._wPos++;

      // ---- smooth drift correction (servo) --------------------------------
      let latency = this._wPos - this._rPos;
      let error = targetLatency - latency;
      let effectiveSpeed = pitchFactor - error * alpha;

      // ---- grain phase and Hann windows -----------------------------------
      // phase goes 0 → 1 over one grain.  Two heads are offset by 0.5 grain.
      const phase = this._gPos / grain;
      const phase2 = phase + 0.5;
      const phase2Wrap = phase2 - Math.floor(phase2);

      // Hann window: 0.5 * (1 - cos(2π·phase))
      const w1 = 0.5 * (1.0 - Math.cos(6.283185307179586 * phase));
      const w2 = 0.5 * (1.0 - Math.cos(6.283185307179586 * phase2Wrap));

      // ---- safety reset (critical only) -----------------------------------
      // If a read head is about to overtake the write head or wrap the buffer,
      // reset both heads while the contribution of the offending head is tiny.
      const latency2 = this._wPos - this._rPos2;

      if ((latency < minSafe && w1 < 0.05) || (latency > maxSafe && w1 < 0.05)) {
        this._rPos = this._wPos - targetLatency;
        this._rPos2 = this._rPos - grain * 0.5;
        latency = targetLatency;
        error = 0;
        effectiveSpeed = pitchFactor;
      }
      if ((latency2 < minSafe && w2 < 0.05) || (latency2 > maxSafe && w2 < 0.05)) {
        this._rPos2 = this._wPos - targetLatency - grain * 0.5;
      }

      // ---- read, mix, output ----------------------------------------------
      const s1 = this._read(this._rPos);
      const s2 = this._read(this._rPos2);
      const pitched = s1 * w1 + s2 * w2;

      out[i] = inp[i] * (1.0 - mix) + pitched * mix;

      // ---- advance --------------------------------------------------------
      this._rPos += effectiveSpeed;
      this._rPos2 += effectiveSpeed;
      this._gPos = (this._gPos + 1) % grain;
    }

    return true;
  }
}

registerProcessor('whammy-processor', WhammyProcessor);
