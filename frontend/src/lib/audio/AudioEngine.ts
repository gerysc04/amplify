import { NamProcessor } from './NamProcessor';
import { PedalChain } from './PedalChain';
import { EffectsChain, type DelayParams, type ReverbParams, type ChorusParams } from './EffectsChain';
import type { WahParams, WhammyParams, TransposeParams, ParametricEqBand, PedalSlot } from '../../types/audio';

export type { DelayParams, ReverbParams, ChorusParams, WahParams, WhammyParams, TransposeParams, ParametricEqBand };

// setSinkId is Chrome 110+ — not yet in the standard TS dom lib.
type AudioContextWithSink = AudioContext & {
  setSinkId?(deviceId: string): Promise<void>;
};

/** Write mono Float32 samples to a WAV Blob. */
function _writeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                 // PCM
  view.setUint16(22, 1, true);                 // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);                // 16-bit

  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/** A single-sample impulse: convolution with this = passthrough. */
function makeDirac(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
  buf.getChannelData(0)[0] = 1;
  return buf;
}

export interface AudioEngineOptions {
  inputDeviceId?:  string;
  outputDeviceId?: string;
}

export interface GateParams { enabled: boolean; threshold: number; attack: number; release: number; }
export interface EqParams   { bass: number; mid: number; treble: number; }
export interface CompressorParams { enabled: boolean; threshold: number; ratio: number; attack: number; release: number; knee: number; }

export class AudioEngine {
  private _ctx:           AudioContextWithSink | null = null;
  private _stream:        MediaStream          | null = null;
  private _source:        MediaStreamAudioSourceNode | null = null;
  private _analyser:      AnalyserNode         | null = null;
  private _monoSum:       GainNode             | null = null;
  private _gate:          AudioWorkletNode     | null = null;
  private _preGain:       GainNode             | null = null;
  private _nam:           AudioWorkletNode     | null = null;
  private _bassFilter:    BiquadFilterNode     | null = null;
  private _midFilter:     BiquadFilterNode     | null = null;
  private _trebleFilter:  BiquadFilterNode     | null = null;
  private _cabIR:         ConvolverNode        | null = null;
  private _effects:       EffectsChain         | null = null;
  private _outputGain:    GainNode             | null = null;
  private _wahSum:        GainNode             | null = null;
  private _tuner:         AudioWorkletNode     | null = null;
  private _compressor:    AudioWorkletNode     | null = null;

  // Phase 10 — PedalChain
  private _pedalChain:    PedalChain           | null = null;

  // Phase 7 — Looper + Recorder
  private _looperNode:    AudioWorkletNode     | null = null;
  private _recorderNode:  AudioWorkletNode     | null = null;
  private _recorderChunks: Float32Array[]      = [];
  private _isRecording   = false;

  // Phase 8 — Master Parametric EQ + Spectrum Analyser
  private _parametricEq:     BiquadFilterNode[] = [];
  private _spectrumAnalyser: AnalyserNode | null = null;
  // Parametric EQ params are stored in the BiquadFilterNode instances themselves;
  // no separate cache needed since we read back from nodes when snapshotting.

  private _gain        = 0.5;
  private _irLoaded    = false;
  private _gateParams:   GateParams   = { enabled: true,  threshold: 0.02, attack: 0.003, release: 0.15 };
  private _eqParams:     EqParams     = { bass: 0, mid: 0, treble: 0 };
  private _wahParams:       WahParams       = { enabled: false, frequency: 0.3, q: 10 };
  // Transpose params are applied immediately; no need to cache them
  private _whammyParams:    WhammyParams    = { enabled: false, mode: '+1oct', semitones: 0, expression: 0, mix: 1 };

  // Transpose — pre-amp pitch shifter with dry bypass
  private _transposeNode: AudioWorkletNode | null = null;
  private _transposeDry:  GainNode         | null = null;
  private _transposeWet:  GainNode         | null = null;
  private _delayParams:  DelayParams  = { enabled: false, time: 0.3, feedback: 0.35, mix: 0.3 };
  private _reverbParams: ReverbParams = { enabled: false, mix: 0.25 };
  private _chorusParams: ChorusParams = { enabled: false, rate: 1.5, depth: 0.005, mix: 0.3 };
  private _compressorParams: CompressorParams = { enabled: false, threshold: -20, ratio: 4, attack: 0.003, release: 0.15, knee: 3 };
  private _tunerEnabled = false;

  // Wah — high-Q bandpass mixed with dry signal
  private _wahFilter: BiquadFilterNode | null = null;
  private _wahDry:    GainNode         | null = null;
  private _wahWet:    GainNode         | null = null;

  readonly nam: NamProcessor;

  constructor() {
    this.nam = new NamProcessor();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(options: AudioEngineOptions = {}): Promise<void> {
    this._ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 }) as AudioContextWithSink;

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId:         options.inputDeviceId ? { exact: options.inputDeviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl:  false,
          sampleRate:       48000,
        },
      });
    } catch (err) {
      this._ctx.close();
      this._ctx = null;
      throw err;
    }

    if (this._ctx.state === 'suspended') await this._ctx.resume();
    if (options.outputDeviceId) {
      try {
        await this.setOutputDevice(options.outputDeviceId);
      } catch {
        this._stream.getTracks().forEach((t) => t.stop());
        await this._ctx.close();
        this._ctx = null;
        this._stream = null;
        throw new Error('Failed to set output device');
      }
    }

    // Load worklets in parallel (tuner/whammy failure is non-fatal)
    await Promise.all([
      this._ctx.audioWorklet.addModule('/worklets/gate-processor.js'),
      this._ctx.audioWorklet.addModule('/worklets/nam-processor.js'),
      this._ctx.audioWorklet.addModule('/worklets/wasm-transpose-processor.js', { type: 'module' } as any).catch(() => {}),
      this._ctx.audioWorklet.addModule('/worklets/wasm-whammy-processor.js', { type: 'module' } as any).catch(() => {}),
      this._ctx.audioWorklet.addModule('/worklets/whammy-processor.js').catch(() => {}),
      this._ctx.audioWorklet.addModule('/worklets/tuner-processor.js').catch(() => {}),
      this._ctx.audioWorklet.addModule('/worklets/compressor-processor.js').catch(() => {}),
      this._ctx.audioWorklet.addModule('/worklets/looper-processor.js').catch(() => {}),
      this._ctx.audioWorklet.addModule('/worklets/recorder-processor.js').catch(() => {}),
    ]);

    // --- Source ---
    this._source = this._ctx.createMediaStreamSource(this._stream);

    // --- Analyser ---
    this._analyser = this._ctx.createAnalyser();
    this._analyser.fftSize = 1024;
    this._analyser.smoothingTimeConstant = 0.6;

    // --- Mono downmix ---
    this._monoSum = this._ctx.createGain();
    this._monoSum.channelCount          = 1;
    this._monoSum.channelCountMode      = 'explicit';
    this._monoSum.channelInterpretation = 'speakers';

    // --- Tuner (parallel tap from monoSum, does not affect main chain) ---
    try {
      this._tuner = new AudioWorkletNode(this._ctx, 'tuner-processor');
      this._tuner.port.postMessage({ type: 'params', enabled: this._tunerEnabled });
    } catch { this._tuner = null; }

    // --- Noise gate (pre-NAM) ---
    this._gate = new AudioWorkletNode(this._ctx, 'gate-processor');
    this._applyGateParams();

    // --- Compressor (between gate and pre-gain) ---
    try {
      this._compressor = new AudioWorkletNode(this._ctx, 'compressor-processor');
      this._applyCompressorParams();
    } catch { this._compressor = null; }

    // --- Pre-gain ---
    this._preGain = this._ctx.createGain();
    this._preGain.gain.value = this._gain * 4;

    // --- Phase 10: PedalChain (between pre-gain and NAM amp) ---
    this._pedalChain = new PedalChain(this._ctx);

    // --- NAM worklet ---
    this._nam = new AudioWorkletNode(this._ctx, 'nam-processor');
    this.nam.attach(this._nam);

    // --- 3-band EQ (post-NAM, pre-cab) ---
    this._bassFilter   = this._ctx.createBiquadFilter();
    this._bassFilter.type            = 'lowshelf';
    this._bassFilter.frequency.value = 250;
    this._midFilter    = this._ctx.createBiquadFilter();
    this._midFilter.type             = 'peaking';
    this._midFilter.frequency.value  = 1000;
    this._midFilter.Q.value          = 1.0;
    this._trebleFilter = this._ctx.createBiquadFilter();
    this._trebleFilter.type             = 'highshelf';
    this._trebleFilter.frequency.value  = 4000;
    this._applyEqParams();

    // --- Cab IR ---
    this._cabIR          = this._ctx.createConvolver();
    this._cabIR.normalize = false;
    this._cabIR.buffer    = makeDirac(this._ctx);

    // --- Wah — resonant peaking filter (wet) mixed with dry; sum goes to transpose/gate ---
    // Peaking (not bandpass) is the correct filter for wah: it boosts a narrow band
    // while letting the full signal pass through. Bandpass with high Q removes everything
    // outside its narrow passband, which is why the signal vanished at high frequencies.
    this._wahFilter = this._ctx.createBiquadFilter();
    this._wahFilter.type            = 'peaking';
    this._wahFilter.frequency.value = 700;
    this._wahFilter.Q.value         = 5;
    this._wahFilter.gain.value      = 0;
    this._wahDry = this._ctx.createGain(); this._wahDry.gain.value = 1;
    this._wahWet = this._ctx.createGain(); this._wahWet.gain.value = 0;
    this._applyWahParams();

    // --- Post-cab effects ---
    this._effects = new EffectsChain(this._ctx);
    this._effects.initWhammy();
    this._effects.setDelay(this._delayParams);
    this._effects.setReverb(this._reverbParams);
    this._effects.setChorus(this._chorusParams);
    this._effects.setWhammy(this._whammyParams);

    // --- Output ---
    this._outputGain = this._ctx.createGain();
    this._outputGain.gain.value = 0.7;

    // --- Signal chain ---
    // Transpose — dry bypass always passes signal; wet path (worklet) only when semitones != 0
    this._transposeDry = this._ctx.createGain(); this._transposeDry.gain.value = 1;
    this._transposeWet = this._ctx.createGain(); this._transposeWet.gain.value = 0;
    // Try WASM pitch shifter first, fall back to JS OLA
    try {
      this._transposeNode = new AudioWorkletNode(this._ctx, 'wasm-transpose-processor');
    } catch {
      try {
        this._transposeNode = new AudioWorkletNode(this._ctx, 'whammy-processor');
        (this._transposeNode.parameters as AudioParamMap).get('mix')?.setValueAtTime(1, 0);
      } catch { this._transposeNode = null; }
    }

    // source → monoSum → analyser → wah → transposeBypass/transposeNode → gate → compressor → preGain → NAM
    //   → bass → mid → treble → cabIR → effects → outputGain → speakers
    // source → monoSum → analyser → wahDry ─────────────────── wahSum → transpose → gate
    //                              └→ wahFilter → wahWet ───┘
    // tuner tap: monoSum → tunerWorklet (parallel, no output)
    this._wahSum = this._ctx.createGain();
    this._source.connect(this._monoSum);
    this._monoSum.connect(this._analyser);
    if (this._tuner) this._monoSum.connect(this._tuner);
    this._analyser.connect(this._wahDry!);
    this._analyser.connect(this._wahFilter!);
    this._wahFilter!.connect(this._wahWet!);
    this._wahDry!.connect(this._wahSum);
    this._wahWet!.connect(this._wahSum);
    this._wahSum.connect(this._transposeDry!);
    this._transposeDry!.connect(this._gate!);
    if (this._transposeNode) {
      this._wahSum.connect(this._transposeNode);
      this._transposeNode.connect(this._transposeWet!);
      this._transposeWet!.connect(this._gate!);
    }
    if (this._compressor) {
      this._gate.connect(this._compressor);
      this._compressor.connect(this._preGain);
    } else {
      this._gate.connect(this._preGain);
    }
    this._preGain.connect(this._pedalChain.input);
    this._pedalChain.output.connect(this._nam);
    this._nam.connect(this._bassFilter);
    this._bassFilter.connect(this._midFilter);
    this._midFilter.connect(this._trebleFilter);
    this._trebleFilter.connect(this._cabIR);
    this._cabIR.connect(this._effects.input);

    // --- Looper (between effects and parametric EQ) ---
    try {
      this._looperNode = new AudioWorkletNode(this._ctx, 'looper-processor');
      this._looperNode.channelCount = 1;
      this._looperNode.channelCountMode = 'explicit';
    } catch { this._looperNode = null; }

    if (this._looperNode) {
      this._effects.output.connect(this._looperNode);
    } else {
      // effects.output will connect to EQ chain below
    }

    // --- Recorder (parallel tap from looper/effects output, BEFORE parametric EQ) ---
    try {
      this._recorderNode = new AudioWorkletNode(this._ctx, 'recorder-processor');
    } catch { this._recorderNode = null; }

    if (this._recorderNode) {
      const tapSource = this._looperNode ?? this._effects.output;
      tapSource.connect(this._recorderNode);
    }

    // --- Phase 8: Master Parametric EQ (after looper, before output gain) ---
    const eqInput = this._looperNode ?? this._effects.output;
    let currentNode: AudioNode = eqInput;

    this._parametricEq = [];
    const fixedFreqs = [65, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < 9; i++) {
      const eq = this._ctx.createBiquadFilter();
      eq.type = 'peaking';
      eq.frequency.value = fixedFreqs[i];
      eq.gain.value = 0;
      eq.Q.value = 1.4;
      currentNode.connect(eq);
      this._parametricEq.push(eq);
      currentNode = eq;
    }

    // Spectrum analyser tap after EQ
    this._spectrumAnalyser = this._ctx.createAnalyser();
    this._spectrumAnalyser.fftSize = 2048;
    currentNode.connect(this._spectrumAnalyser);
    this._spectrumAnalyser.connect(this._outputGain);

    this._outputGain.connect(this._ctx.destination);
  }

  stop(): void {
    this._pedalChain?.dispose();
    this._effects?.dispose();
    this.nam.detach();

    // Disconnect every node we can reach before closing the context
    this._source?.disconnect();
    this._monoSum?.disconnect();
    this._analyser?.disconnect();
    this._wahDry?.disconnect();
    this._wahWet?.disconnect();
    this._wahFilter?.disconnect();
    this._wahSum?.disconnect();
    this._transposeDry?.disconnect();
    this._transposeWet?.disconnect();
    this._transposeNode?.disconnect();
    this._gate?.disconnect();
    this._compressor?.disconnect();
    this._preGain?.disconnect();
    this._nam?.disconnect();
    this._bassFilter?.disconnect();
    this._midFilter?.disconnect();
    this._trebleFilter?.disconnect();
    this._cabIR?.disconnect();
    this._looperNode?.disconnect();
    this._recorderNode?.disconnect();
    for (const eq of this._parametricEq) eq.disconnect();
    this._spectrumAnalyser?.disconnect();
    this._outputGain?.disconnect();

    this._stream?.getTracks().forEach((t) => t.stop());
    this._ctx?.close();

    this._ctx          = null;
    this._stream       = null;
    this._source       = null;
    this._analyser     = null;
    this._monoSum      = null;
    this._gate         = null;
    this._preGain      = null;
    this._nam          = null;
    this._bassFilter   = null;
    this._midFilter    = null;
    this._trebleFilter = null;
    this._cabIR        = null;
    this._effects      = null;
    this._outputGain   = null;
    this._parametricEq = [];
    this._spectrumAnalyser = null;
    this._wahFilter    = null;
    this._wahDry       = null;
    this._wahWet       = null;
    this._wahSum       = null;
    this._transposeNode = null;
    this._transposeDry  = null;
    this._transposeWet  = null;
    this._tuner        = null;
    this._compressor   = null;
    this._looperNode   = null;
    this._recorderNode = null;
    this._isRecording  = false;
    this._recorderChunks = [];
    this._irLoaded     = false;
  }

  // ---------------------------------------------------------------------------
  // Model / IR
  // ---------------------------------------------------------------------------

  async loadNamModel(file: File): Promise<void> {
    await this.nam.loadModel(file);
  }

  async loadCabIR(file: File): Promise<void> {
    if (!this._ctx || !this._cabIR) return;
    const buf = await this._ctx.decodeAudioData(await file.arrayBuffer());
    this._cabIR.buffer = buf;
    this._irLoaded = true;
  }

  bypassCabIr(): void {
    if (!this._ctx || !this._cabIR) return;
    const dirac = this._ctx.createBuffer(1, 1, this._ctx.sampleRate);
    dirac.getChannelData(0)[0] = 1;
    this._cabIR.buffer = dirac;
    this._irLoaded = true;
  }

  // ---------------------------------------------------------------------------
  // Parameter control
  // ---------------------------------------------------------------------------

  setGain(value: number): void {
    this._gain = value;
    if (!this._ctx || !this._preGain) return;
    this._preGain.gain.setTargetAtTime(value * 4, this._ctx.currentTime, 0.01);
  }

  setGateParams(params: GateParams): void {
    this._gateParams = params;
    this._applyGateParams();
  }

  setEqParams(params: EqParams): void {
    this._eqParams = params;
    this._applyEqParams();
  }

  setDelayParams(params: DelayParams): void {
    this._delayParams = params;
    this._effects?.setDelay(params);
  }

  setReverbParams(params: ReverbParams): void {
    this._reverbParams = params;
    this._effects?.setReverb(params);
  }

  setChorusParams(params: ChorusParams): void {
    this._chorusParams = params;
    this._effects?.setChorus(params);
  }

  setWahParams(params: WahParams): void {
    this._wahParams = params;
    this._applyWahParams();
  }

  setTransposeParams({ semitones }: TransposeParams): void {
    if (!this._ctx || !this._transposeDry || !this._transposeWet) return;
    const t      = this._ctx.currentTime;
    const active = semitones !== 0 && this._transposeNode !== null;
    this._transposeDry.gain.setTargetAtTime(active ? 0 : 1, t, 0.02);
    this._transposeWet.gain.setTargetAtTime(active ? 1 : 0, t, 0.02);
    if (this._transposeNode) {
      // WASM: send via MessagePort
      this._transposeNode.port.postMessage({ type: 'param', name: 'semitones', value: semitones });
      // JS fallback: AudioParam (silently fails for WASM nodes)
      (this._transposeNode.parameters as AudioParamMap)
        .get('semitones')?.setTargetAtTime(semitones, t, 0.02);
    }
  }

  setWhammyParams(params: WhammyParams): void {
    this._whammyParams = params;
    this._effects?.setWhammy(params);
  }

  setTunerEnabled(enabled: boolean): void {
    this._tunerEnabled = enabled;
    this._tuner?.port.postMessage({ type: 'params', enabled });
  }

  setCompressorParams(params: CompressorParams): void {
    this._compressorParams = params;
    this._applyCompressorParams();
  }

  setOutputGain(value: number): void {
    if (!this._ctx || !this._outputGain) return;
    this._outputGain.gain.setTargetAtTime(value * 0.7, this._ctx.currentTime, 0.02);
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    if (!this._ctx?.setSinkId) return;
    await this._ctx.setSinkId(deviceId);
  }

  // ---------------------------------------------------------------------------
  // Phase 7 — Recorder
  // ---------------------------------------------------------------------------

  startRecording(): boolean {
    if (!this._recorderNode || this._isRecording) return false;
    this._recorderChunks = [];
    this._isRecording = true;

    this._recorderNode.port.onmessage = (e) => {
      if (e.data.type === 'chunk') {
        this._recorderChunks.push(new Float32Array(e.data.samples));
      }
    };

    this._recorderNode.port.postMessage({ type: 'start' });
    return true;
  }

  stopRecording(): Blob | null {
    if (!this._recorderNode || !this._isRecording) return null;
    this._isRecording = false;
    this._recorderNode.port.postMessage({ type: 'stop' });

    const totalLength = this._recorderChunks.reduce((sum, c) => sum + c.length, 0);
    const allSamples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this._recorderChunks) {
      allSamples.set(chunk, offset);
      offset += chunk.length;
    }
    this._recorderChunks = [];

    return _writeWav(allSamples, this._ctx?.sampleRate ?? 48000);
  }

  isRecording(): boolean { return this._isRecording; }

  // ---------------------------------------------------------------------------
  // Phase 7 — Looper
  // ---------------------------------------------------------------------------

  startLoopRecord(): void {
    this._looperNode?.port.postMessage({ type: 'start_record' });
  }

  stopLoopRecord(): void {
    this._looperNode?.port.postMessage({ type: 'stop_record' });
  }

  playLoop(): void {
    this._looperNode?.port.postMessage({ type: 'play' });
  }

  overdubLoop(): void {
    this._looperNode?.port.postMessage({ type: 'overdub' });
  }

  stopLoop(): void {
    this._looperNode?.port.postMessage({ type: 'stop' });
  }

  clearLoop(): void {
    this._looperNode?.port.postMessage({ type: 'clear' });
  }

  getLooperPort(): MessagePort | null {
    return this._looperNode?.port ?? null;
  }

  // ---------------------------------------------------------------------------
  // Phase 8 — Master Parametric EQ + Spectrum Analyser
  // ---------------------------------------------------------------------------

  setParametricEqBands(bands: ParametricEqBand[]): void {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    for (let i = 0; i < this._parametricEq.length; i++) {
      const node = this._parametricEq[i];
      const band = bands[i];
      if (!node || !band) continue;
      // Graphic EQ: always peaking, fixed frequency
      node.type = 'peaking';
      const timeConst = 0.01;
      node.frequency.setTargetAtTime(Math.max(20, Math.min(20000, band.frequency)), t, timeConst);
      node.gain.setTargetAtTime(band.enabled ? band.gain : 0, t, timeConst);
      node.Q.setTargetAtTime(Math.max(0.1, Math.min(10, band.q)), t, timeConst);
    }
  }

  getSpectrumData(): Uint8Array | null {
    if (!this._spectrumAnalyser) return null;
    const data = new Uint8Array(this._spectrumAnalyser.frequencyBinCount);
    this._spectrumAnalyser.getByteFrequencyData(data);
    return data;
  }

  /** Measure effects-chain latency by injecting a sine burst and reading the recorder tap. */
  async measureLatency(): Promise<number> {
    if (!this._ctx || !this._monoSum || !this._recorderNode) return 0;
    if (this._isRecording) return -1; // busy

    // Temporarily hijack recorder chunks
    this._recorderChunks = [];
    const originalHandler = this._recorderNode.port.onmessage;
    this._recorderNode.port.onmessage = (e) => {
      if (e.data.type === 'chunk') this._recorderChunks.push(new Float32Array(e.data.samples));
    };

    // Start recorder, give it one block to arm
    this._recorderNode.port.postMessage({ type: 'start' });
    await new Promise((r) => setTimeout(r, 10));

    // Build a 1 kHz Hann-windowed burst (10 ms, moderate level)
    const sampleRate = this._ctx.sampleRate;
    const burstSamples = Math.ceil(sampleRate * 0.01);
    const burstBuf = this._ctx.createBuffer(1, burstSamples, sampleRate);
    const burstCh = burstBuf.getChannelData(0);
    for (let i = 0; i < burstSamples; i++) {
      const w = 0.5 * (1 - Math.cos((Math.PI * i) / burstSamples));
      burstCh[i] = Math.sin((2 * Math.PI * 1000 * i) / sampleRate) * w * 0.6;
    }

    const source = this._ctx.createBufferSource();
    source.buffer = burstBuf;
    source.connect(this._monoSum);

    const t0 = this._ctx.currentTime;
    source.start(t0);

    // Wait for burst to propagate through the chain
    await new Promise((r) => setTimeout(r, 120));

    // Stop and clean up
    this._recorderNode.port.postMessage({ type: 'stop' });
    source.disconnect();
    this._recorderNode.port.onmessage = originalHandler;

    // Flatten chunks
    const total = this._recorderChunks.reduce((s, c) => s + c.length, 0);
    if (total === 0) return -1;
    const flat = new Float32Array(total);
    let off = 0;
    for (const c of this._recorderChunks) {
      flat.set(c, off);
      off += c.length;
    }

    // Robust detection: require 4 consecutive samples above threshold
    // to avoid single-sample noise false-positives.
    const threshold = 0.06;
    let firstIdx = -1;
    for (let i = 0; i < flat.length - 3; i++) {
      if (
        Math.abs(flat[i])     > threshold &&
        Math.abs(flat[i + 1]) > threshold &&
        Math.abs(flat[i + 2]) > threshold &&
        Math.abs(flat[i + 3]) > threshold
      ) {
        firstIdx = i;
        break;
      }
    }
    if (firstIdx < 0) return -1;

    return (firstIdx / sampleRate) * 1000;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _applyGateParams(): void {
    if (!this._gate) return;
    const { enabled, threshold, attack, release } = this._gateParams;
    this._gate.port.postMessage({ type: 'params', enabled, threshold, attack, release });
  }

  private _applyWahParams(): void {
    if (!this._ctx || !this._wahFilter || !this._wahDry || !this._wahWet) return;
    const { enabled, frequency, q } = this._wahParams;
    // Logarithmic sweep: 300 Hz → 2200 Hz feels natural (linear is too jumpy at top)
    const hz = 300 * Math.pow(2200 / 300, frequency);
    const t  = this._ctx.currentTime;
    this._wahFilter.frequency.setTargetAtTime(hz, t, 0.005);
    this._wahFilter.Q.setTargetAtTime(Math.max(q, 1), t, 0.005);
    // Peaking filter gain: +10 dB resonant boost when on, 0 dB (flat) when off.
    // Peaking (not bandpass) lets the full signal through while emphasizing the
    // sweep frequency — this is how real CryBaby circuits work.
    this._wahFilter.gain.setTargetAtTime(enabled ? 10 : 0, t, 0.01);
    // Dry blend: 30% dry even when wah is on. Without this, only the narrow
    // boosted band reaches the noise gate and notes get cut out too early on
    // the decay tail. The dry path preserves sustain and low-string body.
    this._wahDry.gain.setTargetAtTime(enabled ? 0.3 : 1, t, 0.01);
    this._wahWet.gain.setTargetAtTime(enabled ? 1 : 0, t, 0.01);
  }

  private _applyCompressorParams(): void {
    if (!this._compressor) return;
    const { enabled, threshold, ratio, attack, release, knee } = this._compressorParams;
    this._compressor.port.postMessage({ type: 'params', enabled, threshold, ratio, attack, release, knee });
  }

  private _applyEqParams(): void {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const { bass, mid, treble } = this._eqParams;
    this._bassFilter?.gain.setTargetAtTime(bass, t, 0.01);
    this._midFilter?.gain.setTargetAtTime(mid, t, 0.01);
    this._trebleFilter?.gain.setTargetAtTime(treble, t, 0.01);
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Phase 10 — PedalChain API
  // ---------------------------------------------------------------------------

  async addPedal(modelFile: File, slot: PedalSlot, index?: number): Promise<void> {
    await this._pedalChain?.addPedal(modelFile, slot, index);
  }

  removePedal(index: number): void {
    this._pedalChain?.removePedal(index);
  }

  movePedal(fromIndex: number, toIndex: number): void {
    this._pedalChain?.movePedal(fromIndex, toIndex);
  }

  setPedalEnabled(index: number, enabled: boolean): void {
    this._pedalChain?.setEnabled(index, enabled);
  }

  getPedalSlots(): PedalSlot[] {
    return this._pedalChain?.getSlots() ?? [];
  }

  clearPedals(): void {
    const count = this._pedalChain?.getLength() ?? 0;
    for (let i = count - 1; i >= 0; i--) {
      this._pedalChain?.removePedal(i);
    }
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  getAnalyser():   AnalyserNode | null { return this._analyser; }
  getTunerNode():  AudioWorkletNode | null { return this._tuner; }
  isNamLoaded():   boolean             { return this.nam.isLoaded(); }
  isIRLoaded():    boolean             { return this._irLoaded; }
}
