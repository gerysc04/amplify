/**
 * Tuner AudioWorklet — lightweight sample buffer.
 *
 * Buffers 1024 samples and posts them to the main thread every ~200ms.
 * The main thread runs YIN (heavy math) so the audio thread never blocks.
 */

const BUFFER_SIZE = 4096;   // enough for ~23 Hz minimum (covers all guitar tunings)
const POST_INTERVAL = 75;     // frames (~200ms at 128smp/frame)

class TunerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(BUFFER_SIZE);
    this._pos = 0;
    this._frameCounter = 0;
    this._enabled = true;

    this.port.onmessage = ({ data }) => {
      if (data.type === 'params' && data.enabled !== undefined) {
        this._enabled = data.enabled;
      }
    };
  }

  process(inputs, outputs) {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (!inp) return true;

    // Pass-through unchanged
    if (out) out.set(inp);
    if (!this._enabled) return true;

    // Write to ring buffer
    for (let i = 0; i < inp.length; i++) {
      this._buf[this._pos] = inp[i];
      this._pos = (this._pos + 1) % BUFFER_SIZE;
    }

    this._frameCounter++;
    if (this._frameCounter >= POST_INTERVAL) {
      this._frameCounter = 0;
      // Re-order ring buffer chronologically before posting.
      // YIN needs samples in time-order; a raw ring-buffer copy is jumbled.
      const ordered = new Float32Array(BUFFER_SIZE);
      ordered.set(this._buf.subarray(this._pos));
      ordered.set(this._buf.subarray(0, this._pos), BUFFER_SIZE - this._pos);
      this.port.postMessage({ type: 'buffer', samples: ordered, sampleRate });
    }

    return true;
  }
}

registerProcessor('tuner-processor', TunerProcessor);
