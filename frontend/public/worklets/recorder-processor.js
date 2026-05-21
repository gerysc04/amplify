/**
 * Recorder worklet — captures raw Float32 samples and posts them to the main thread.
 * The main thread accumulates chunks and writes a WAV file when stopped.
 */
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._recording = false;
    this.port.onmessage = (e) => {
      if (e.data.type === 'start') this._recording = true;
      if (e.data.type === 'stop')  this._recording = false;
    };
  }

  process(inputs, outputs) {
    const inp = inputs[0]?.[0];
    if (!inp || !this._recording) return true;

    // Copy the chunk because the underlying buffer is reused by the browser
    this.port.postMessage({ type: 'chunk', samples: new Float32Array(inp) });
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
