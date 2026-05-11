import { NamProcessor } from './NamProcessor';
import { EffectsChain, type DelayParams, type ReverbParams, type ChorusParams } from './EffectsChain';

export type { DelayParams, ReverbParams, ChorusParams };

// setSinkId is Chrome 110+ — not yet in the standard TS dom lib.
type AudioContextWithSink = AudioContext & {
  setSinkId?(deviceId: string): Promise<void>;
};

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

export class AudioEngine {
  private _ctx:           AudioContextWithSink | null = null;
  private _stream:        MediaStream          | null = null;
  private _source:        MediaStreamAudioSourceNode | null = null;
  private _analyser:      AnalyserNode         | null = null;
  private _gate:          AudioWorkletNode     | null = null;
  private _preGain:       GainNode             | null = null;
  private _nam:           AudioWorkletNode     | null = null;
  private _bassFilter:    BiquadFilterNode     | null = null;
  private _midFilter:     BiquadFilterNode     | null = null;
  private _trebleFilter:  BiquadFilterNode     | null = null;
  private _cabIR:         ConvolverNode        | null = null;
  private _effects:       EffectsChain         | null = null;
  private _outputGain:    GainNode             | null = null;

  private _gain        = 0.5;
  private _irLoaded    = false;
  private _gateParams:  GateParams  = { enabled: true, threshold: 0.02, attack: 0.003, release: 0.15 };
  private _eqParams:    EqParams    = { bass: 0, mid: 0, treble: 0 };
  private _delayParams: DelayParams = { enabled: false, time: 0.3, feedback: 0.35, mix: 0.3 };
  private _reverbParams: ReverbParams = { enabled: false, mix: 0.25 };
  private _chorusParams: ChorusParams = { enabled: false, rate: 1.5, depth: 0.005, mix: 0.3 };

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
    if (options.outputDeviceId) await this.setOutputDevice(options.outputDeviceId);

    // Load both worklets in parallel
    await Promise.all([
      this._ctx.audioWorklet.addModule('/worklets/gate-processor.js'),
      this._ctx.audioWorklet.addModule('/worklets/nam-processor.js'),
    ]);

    // --- Source ---
    this._source = this._ctx.createMediaStreamSource(this._stream);

    // --- Analyser ---
    this._analyser = this._ctx.createAnalyser();
    this._analyser.fftSize = 1024;
    this._analyser.smoothingTimeConstant = 0.6;

    // --- Mono downmix ---
    const monoSum = this._ctx.createGain();
    monoSum.channelCount          = 1;
    monoSum.channelCountMode      = 'explicit';
    monoSum.channelInterpretation = 'speakers';

    // --- Noise gate (pre-NAM) ---
    this._gate = new AudioWorkletNode(this._ctx, 'gate-processor');
    this._applyGateParams();

    // --- Pre-gain ---
    this._preGain = this._ctx.createGain();
    this._preGain.gain.value = this._gain * 4;

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

    // --- Post-cab effects ---
    this._effects = new EffectsChain(this._ctx);
    this._effects.setDelay(this._delayParams);
    this._effects.setReverb(this._reverbParams);
    this._effects.setChorus(this._chorusParams);

    // --- Output ---
    this._outputGain = this._ctx.createGain();
    this._outputGain.gain.value = 0.7;

    // --- Signal chain ---
    // source → monoSum → analyser → gate → preGain → NAM
    //   → bass → mid → treble → cabIR → effects → outputGain → speakers
    this._source.connect(monoSum);
    monoSum.connect(this._analyser);
    this._analyser.connect(this._gate);
    this._gate.connect(this._preGain);
    this._preGain.connect(this._nam);
    this._nam.connect(this._bassFilter);
    this._bassFilter.connect(this._midFilter);
    this._midFilter.connect(this._trebleFilter);
    this._trebleFilter.connect(this._cabIR);
    this._cabIR.connect(this._effects.input);
    this._effects.output.connect(this._outputGain);
    this._outputGain.connect(this._ctx.destination);
  }

  stop(): void {
    this._effects?.dispose();
    this.nam.detach();
    this._source?.disconnect();
    this._stream?.getTracks().forEach((t) => t.stop());
    this._ctx?.close();

    this._ctx          = null;
    this._stream       = null;
    this._source       = null;
    this._analyser     = null;
    this._gate         = null;
    this._preGain      = null;
    this._nam          = null;
    this._bassFilter   = null;
    this._midFilter    = null;
    this._trebleFilter = null;
    this._cabIR        = null;
    this._effects      = null;
    this._outputGain   = null;
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

  async setOutputDevice(deviceId: string): Promise<void> {
    if (!this._ctx?.setSinkId) return;
    await this._ctx.setSinkId(deviceId);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _applyGateParams(): void {
    if (!this._gate) return;
    const { enabled, threshold, attack, release } = this._gateParams;
    this._gate.port.postMessage({ type: 'params', enabled, threshold, attack, release });
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

  getAnalyser():   AnalyserNode | null { return this._analyser; }
  isNamLoaded():   boolean             { return this.nam.isLoaded(); }
  isIRLoaded():    boolean             { return this._irLoaded; }
}
