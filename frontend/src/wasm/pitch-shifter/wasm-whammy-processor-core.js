
// === Worklet class (bundled with wasm-bindgen glue above) ===
class WasmWhammyProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ready = false;
    this._pendingSemitones = 0;
    this._init();
    this.port.onmessage = (e) => {
      if (e.data.type === 'param' && e.data.name === 'semitones') {
        this._pendingSemitones = e.data.value;
      }
    };
  }

  async _init() {
    try {
      // __wbg_init is defined in the prepended glue; auto-resolves WASM path
      await __wbg_init();
      this._shifter = new WhammyShifter(globalThis.sampleRate || 48000);
      this._ready = true;
    } catch (err) {
      console.error('[WasmWhammyProcessor] WASM init failed:', err);
    }
  }

  process(inputs, outputs) {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (!inp || !out) return true;

    if (!this._ready) {
      // Pass through dry while WASM loads — never output silence
      out.set(inp);
      return true;
    }

    this._shifter.set_semitones(this._pendingSemitones);
    this._shifter.process(inp, out);
    return true;
  }
}

registerProcessor('wasm-whammy-processor', WasmWhammyProcessor);
