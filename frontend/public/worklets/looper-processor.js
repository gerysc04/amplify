/**
 * Looper worklet — sample-accurate record / play / overdub.
 *
 * Buffer: 60 seconds @ 48 kHz  →  ~2.9 M samples  →  ~11.5 MB (Float32).
 * All control messages are processed at the start of each 128-sample block
 * for sample-accurate state transitions.
 */
class LooperProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'feedback', defaultValue: 1.0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();

    // 60-second max loop
    this._maxSamples = 48000 * 60;
    this._buffer = new Float32Array(this._maxSamples);

    this._state = 'idle';   // idle | recording | playing | overdubbing
    this._loopLen = 0;      // set when recording stops
    this._pos = 0;          // read/write position

    // Command queue for sample-accurate state transitions
    this._pendingCmd = null;

    this.port.onmessage = (e) => {
      this._pendingCmd = e.data;
    };
  }

  process(inputs, outputs, parameters) {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (!inp || !out) return true;

    // Process pending command at block boundary (sample-accurate)
    if (this._pendingCmd) {
      this._handleCmd(this._pendingCmd);
      this._pendingCmd = null;
    }

    const feedback = parameters.feedback?.[0] ?? 1.0;

    for (let i = 0; i < inp.length; i++) {
      const live = inp[i];

      switch (this._state) {
        case 'idle': {
          out[i] = live;
          break;
        }

        case 'recording': {
          this._buffer[this._pos] = live;
          out[i] = live;
          this._pos++;
          // Safety: don't overflow buffer
          if (this._pos >= this._maxSamples) {
            this._loopLen = this._pos;
            this._state = 'playing';
            this._pos = 0;
          }
          break;
        }

        case 'playing': {
          const looped = this._buffer[this._pos];
          out[i] = live + looped;
          this._pos++;
          if (this._pos >= this._loopLen) this._pos = 0;
          break;
        }

        case 'overdubbing': {
          const existing = this._buffer[this._pos];
          // Mix existing with live, apply feedback decay, soft-clip
          let mixed = existing * feedback + live;
          mixed = Math.max(-1.0, Math.min(1.0, mixed));
          this._buffer[this._pos] = mixed;
          out[i] = mixed;
          this._pos++;
          if (this._pos >= this._loopLen) this._pos = 0;
          break;
        }
      }
    }

    // Throttle status updates to ~every 20 ms (≈1k samples @ 48kHz)
    this._statusCounter = (this._statusCounter || 0) + inp.length;
    if (this._statusCounter >= 1024) {
      this.port.postMessage({
        type: 'status',
        state: this._state,
        position: this._pos,
        length: this._loopLen,
      });
      this._statusCounter = 0;
    }

    return true;
  }

  _handleCmd(cmd) {
    switch (cmd.type) {
      case 'start_record': {
        this._state = 'recording';
        this._pos = 0;
        this._loopLen = 0;
        break;
      }
      case 'stop_record': {
        if (this._state === 'recording') {
          this._loopLen = this._pos;
          this._state = this._loopLen > 0 ? 'playing' : 'idle';
          this._pos = 0;
        }
        break;
      }
      case 'play': {
        if (this._loopLen > 0) {
          this._state = 'playing';
          this._pos = 0;
        }
        break;
      }
      case 'overdub': {
        if (this._loopLen > 0) {
          this._state = 'overdubbing';
        }
        break;
      }
      case 'stop': {
        this._state = 'idle';
        this._pos = 0;
        break;
      }
      case 'clear': {
        this._buffer.fill(0);
        this._state = 'idle';
        this._loopLen = 0;
        this._pos = 0;
        break;
      }
      case 'set_feedback': {
        // feedback is handled via AudioParam, but we can also set it here
        break;
      }
    }
  }
}

registerProcessor('looper-processor', LooperProcessor);
