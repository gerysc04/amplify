/**
 * NAM AudioWorklet — inline LSTM + WaveNet inference.
 *
 * Matches NAM v0.5.x weight layout exactly:
 *   _Layers block = _rechannel + N × (_conv, _input_mixer, _1x1) + _head_rechannel
 *   WaveNet       = Σ _Layers blocks + head_scale scalar (last weight)
 *
 * Model weights are received once via postMessage.  Inference runs
 * synchronously inside process() — no ring buffer, no extra latency.
 *
 * Plain ES2017 JS (no imports, no TypeScript).
 */

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

// ---------------------------------------------------------------------------
// LSTM
// ---------------------------------------------------------------------------

class LSTMEngine {
  constructor(config, weights) {
    const H = config.hidden_size;
    const L = config.num_layers ?? 1;
    this.H = H;
    this.L = L;

    let off = 0;
    this.layers = [];

    for (let l = 0; l < L; l++) {
      const IS = l === 0 ? 1 : H;
      const wIh = weights.subarray(off, off + 4 * H * IS); off += 4 * H * IS;
      const wHh = weights.subarray(off, off + 4 * H * H);  off += 4 * H * H;
      const bIh = weights.subarray(off, off + 4 * H);      off += 4 * H;
      const bHh = weights.subarray(off, off + 4 * H);      off += 4 * H;
      this.layers.push({ wIh, wHh, bIh, bHh });
    }

    this.headW = weights.subarray(off, off + H); off += H;
    this.headB = weights[off];

    this.hx    = Array.from({ length: L }, () => new Float32Array(H));
    this.cx    = Array.from({ length: L }, () => new Float32Array(H));
    this.gates = new Float32Array(4 * H);
  }

  process(input, output) {
    const H = this.H;
    const gates = this.gates;

    for (let n = 0; n < input.length; n++) {
      let scalar = input[n];

      for (let l = 0; l < this.L; l++) {
        const { wIh, wHh, bIh, bHh } = this.layers[l];
        const h = this.hx[l];
        const c = this.cx[l];

        if (l === 0) {
          for (let g = 0; g < 4 * H; g++) gates[g] = wIh[g] * scalar + bIh[g];
        } else {
          const prev = this.hx[l - 1];
          for (let g = 0; g < 4 * H; g++) {
            let s = bIh[g];
            const row = g * H;
            for (let k = 0; k < H; k++) s += wIh[row + k] * prev[k];
            gates[g] = s;
          }
        }

        for (let g = 0; g < 4 * H; g++) {
          let s = gates[g] + bHh[g];
          const row = g * H;
          for (let k = 0; k < H; k++) s += wHh[row + k] * h[k];
          gates[g] = s;
        }

        for (let j = 0; j < H; j++) {
          const ig = sigmoid(gates[j]);
          const fg = sigmoid(gates[H + j]);
          const gg = Math.tanh(gates[2 * H + j]);
          const og = sigmoid(gates[3 * H + j]);
          c[j] = fg * c[j] + ig * gg;
          h[j] = og * Math.tanh(c[j]);
        }
      }

      const hL = this.hx[this.L - 1];
      let out = this.headB;
      for (let k = 0; k < H; k++) out += this.headW[k] * hL[k];
      output[n] = out;
    }
  }

  reset() {
    for (let l = 0; l < this.L; l++) { this.hx[l].fill(0); this.cx[l].fill(0); }
  }
}

// ---------------------------------------------------------------------------
// WaveNet — NAM v0.5.x _Layers block
//
// Weight layout (in order):
//   1. _rechannel   Conv1d(IS, C, 1, bias=False)           → C×IS
//   2. Per dilation:
//      a. _conv      Conv1d(C, C, K, dilation)  weight+bias → C²K + C
//      b. _input_mixer Conv1d(CS, C, 1, bias=False)         → C×CS  (CS=1 → C)
//      c. _1x1       Conv1d(C, C, 1)            weight+bias → C² + C
//   3. _head_rechannel Conv1d(C, HS, 1, bias=head_bias)   → HS×C [+ HS]
//
// WaveNet appends head_scale as a final scalar after all _Layers blocks.
// ---------------------------------------------------------------------------

class WaveNetLayerEngine {
  constructor(config, weights, off) {
    const {
      input_size, condition_size, channels, kernel_size,
      dilations, head_size, head_bias,
    } = config;
    this.IS = input_size;
    this.CS = condition_size; // always 1 in practice
    this.C  = channels;
    this.K  = kernel_size;
    this.HS = head_size;

    // 1. _rechannel: Conv1d(IS, C, 1, bias=False)  weight [C, IS]
    this.rechW = weights.subarray(off, off + channels * input_size);
    off += channels * input_size;

    // 2. Dilated blocks
    this.blocks = dilations.map(dilation => {
      // a. _conv: Conv1d(C, C, K, dilation)  — weight [C,C,K] + bias [C]
      const convWN = channels * channels * kernel_size;
      const convW = weights.subarray(off, off + convWN); off += convWN;
      const convB = weights.subarray(off, off + channels); off += channels;

      // b. _input_mixer: Conv1d(CS, C, 1, bias=False) — weight [C, CS] (CS=1 ⟹ C scalars)
      const mixWN = channels * condition_size;
      const mixW = weights.subarray(off, off + mixWN); off += mixWN;

      // c. _1x1: Conv1d(C, C, 1) — weight [C, C] + bias [C]
      const w1WN = channels * channels;
      const w1W = weights.subarray(off, off + w1WN); off += w1WN;
      const w1B = weights.subarray(off, off + channels); off += channels;

      // Causal history for _conv (K−1)*d past samples of x entering this block
      const bufLen = Math.max((kernel_size - 1) * dilation, 1);
      return {
        dilation, convW, convB, mixW, w1W, w1B,
        history: new Float32Array(bufLen * channels), histPos: 0, bufLen,
      };
    });

    // 3. _head_rechannel: Conv1d(C, HS, 1, bias=head_bias) — weight [HS, C] + optional bias
    this.headRW = weights.subarray(off, off + head_size * channels);
    off += head_size * channels;
    this.headRB = head_bias ? weights.subarray(off, off + head_size) : null;
    if (head_bias) off += head_size;

    this.nextOff = off;

    // Pre-allocated scratch — zero GC inside step()
    this.xBuf    = new Float32Array(channels);   // running channel state (rechanneled + residuals)
    this.xOut    = new Float32Array(channels);   // copy of final x returned to WaveNetEngine
    this.headAcc = new Float32Array(channels);   // Σ post_activations across all dilated blocks
    this.zconv   = new Float32Array(channels);   // dilated conv output
    this.z1      = new Float32Array(channels);   // conv + mix; reused to hold post_act
    this.pastA   = new Float32Array(channels);   // x[t−d]
    this.pastB   = new Float32Array(channels);   // x[t−2d] (K≥3 only)
    this.headOut = new Float32Array(head_size);  // _head_rechannel output (returned)
  }

  /**
   * Process one audio sample through this _Layers block.
   *
   * @param {Float32Array} inputVec   — length IS (output of previous _Layers or raw [s])
   * @param {number}       condScalar — original audio sample (condition, always 1-ch)
   * @param {Float32Array|null} incomingHead — head accumulation from previous _Layers
   *                                           (length == this.C, since HS_prev == C_this)
   *
   * After the call:
   *   this.xOut    holds the C-channel output (fed as inputVec to the next _Layers)
   *   this.headOut holds the HS-channel head output
   */
  step(inputVec, condScalar, incomingHead) {
    const { IS, C, K, HS } = this;
    const x       = this.xBuf;
    const headAcc = this.headAcc;

    // --- Rechannel: x[c] = Σ_i rechW[c*IS+i] * inputVec[i]  (no bias) ---
    for (let c = 0; c < C; c++) {
      let s = 0;
      const row = c * IS;
      for (let i = 0; i < IS; i++) s += this.rechW[row + i] * inputVec[i];
      x[c] = s;
    }

    // --- Head accumulator: start from incoming head (HS_prev == C) or zero ---
    headAcc.fill(0);
    if (incomingHead !== null) {
      for (let c = 0; c < C; c++) headAcc[c] = incomingHead[c];
    }

    // --- Dilated blocks ---
    for (const blk of this.blocks) {
      const { dilation, convW, convB, mixW, w1W, w1B, history, bufLen } = blk;
      const hp  = blk.histPos;
      const zconv = this.zconv;
      const z1    = this.z1;

      // Read past x-values entering this block (x before residual update)
      if (K === 2) {
        const p0 = hp * C;
        for (let c = 0; c < C; c++) this.pastA[c] = history[p0 + c]; // x[t−d]
      } else { // K=3
        const p0 = hp * C;
        const p1 = ((hp + dilation) % bufLen) * C;
        for (let c = 0; c < C; c++) {
          this.pastB[c] = history[p0 + c]; // x[t−2d]
          this.pastA[c] = history[p1 + c]; // x[t−d]
        }
      }

      // Write current x to history BEFORE residual update
      const wp = hp * C;
      for (let c = 0; c < C; c++) history[wp + c] = x[c];
      blk.histPos = (hp + 1) % bufLen;

      // Dilated conv: zconv[o] = convB[o] + Σ_{c,k} convW[o*C*K + c*K + k] * x_past[k][c]
      for (let o = 0; o < C; o++) {
        let s = convB[o];
        const rowBase = o * C * K;
        if (K === 2) {
          for (let c = 0; c < C; c++) {
            const b = rowBase + c * 2;
            s += convW[b]     * this.pastA[c]; // k=0 → x[t−d]
            s += convW[b + 1] * x[c];          // k=1 → x[t]
          }
        } else { // K=3
          for (let c = 0; c < C; c++) {
            const b = rowBase + c * 3;
            s += convW[b]     * this.pastB[c]; // k=0 → x[t−2d]
            s += convW[b + 1] * this.pastA[c]; // k=1 → x[t−d]
            s += convW[b + 2] * x[c];          // k=2 → x[t]
          }
        }
        zconv[o] = s;
      }

      // z1 = zconv + input_mixer * condScalar  (CS=1, mixW[c] is the one weight per channel)
      for (let c = 0; c < C; c++) z1[c] = zconv[c] + mixW[c] * condScalar;

      // post_act = tanh(z1); store back into z1 to avoid a separate buffer
      for (let c = 0; c < C; c++) {
        z1[c] = Math.tanh(z1[c]);
        headAcc[c] += z1[c]; // accumulate post_act for head
      }

      // _1x1 conv + residual: x[o] += Σ_c w1W[o*C+c]*post_act[c] + w1B[o]
      for (let o = 0; o < C; o++) {
        let s = w1B[o];
        const row = o * C;
        for (let c = 0; c < C; c++) s += w1W[row + c] * z1[c];
        x[o] += s;
      }
    }

    // Copy final x to xOut (input for next _Layers block)
    for (let c = 0; c < C; c++) this.xOut[c] = x[c];

    // Head rechannel: headOut[h] = Σ_c headRW[h*C+c]*headAcc[c] + headRB[h]
    const headOut = this.headOut;
    for (let h = 0; h < HS; h++) {
      let s = this.headRB ? this.headRB[h] : 0;
      const row = h * C;
      for (let c = 0; c < C; c++) s += this.headRW[row + c] * headAcc[c];
      headOut[h] = s;
    }
  }

  reset() {
    for (const blk of this.blocks) { blk.history.fill(0); blk.histPos = 0; }
    this.xBuf.fill(0);
    this.headAcc.fill(0);
  }
}

// ---------------------------------------------------------------------------
// WaveNet engine — orchestrates all _Layers blocks
// ---------------------------------------------------------------------------

class WaveNetEngine {
  constructor(config, weights) {
    let off = 0;
    this.layers = config.layers.map(layerCfg => {
      const layer = new WaveNetLayerEngine(layerCfg, weights, off);
      off = layer.nextOff;
      return layer;
    });
    // head_scale stored as the last scalar in the weights array
    this.headScale = weights[off] ?? config.head_scale ?? 1;

    // Reusable 1-element array for layer-0 input
    this.inp0 = new Float32Array(1);
  }

  process(input, output) {
    const layers    = this.layers;
    const headScale = this.headScale;
    const inp0      = this.inp0;

    for (let n = 0; n < input.length; n++) {
      const s = input[n];
      inp0[0] = s;

      let inputVec     = inp0;
      let incomingHead = null;

      for (let li = 0; li < layers.length; li++) {
        layers[li].step(inputVec, s, incomingHead);
        incomingHead = layers[li].headOut; // HS-channel head (HS_i == C_{i+1})
        inputVec     = layers[li].xOut;   // C-channel output → next layer's IS
      }

      // incomingHead is the final layer's HS=1 head output
      output[n] = headScale * incomingHead[0];
    }
  }

  reset() { for (const l of this.layers) l.reset(); }
}

// ---------------------------------------------------------------------------
// AudioWorkletProcessor
// ---------------------------------------------------------------------------

class NamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._engine = null;

    this.port.onmessage = ({ data }) => {
      if (data.type === 'load-model') {
        try {
          const { architecture, config, weights } = data;
          if (architecture === 'LSTM') {
            this._engine = new LSTMEngine(config, weights);
          } else if (architecture === 'WaveNet') {
            this._engine = new WaveNetEngine(config, weights);
          } else {
            console.error('[nam-processor] Unknown architecture:', architecture);
          }
        } catch (e) {
          console.error('[nam-processor] Model init failed:', e);
          this._engine = null;
        }
      } else if (data.type === 'reset') {
        this._engine?.reset();
      }
    };
  }

  process(inputs, outputs) {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (!inp || !out) return true;

    if (this._engine) {
      this._engine.process(inp, out);
    } else {
      out.set(inp); // passthrough until model loaded
    }

    return true;
  }
}

registerProcessor('nam-processor', NamProcessor);
