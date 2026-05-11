import { NamProcessor } from './NamProcessor';

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

export class AudioEngine {
  private context:       AudioContextWithSink | null = null;
  private stream:        MediaStream          | null = null;
  private sourceNode:    MediaStreamAudioSourceNode | null = null;
  private analyserNode:  AnalyserNode         | null = null;
  private preGainNode:   GainNode             | null = null;
  private workletNode:   AudioWorkletNode     | null = null;
  private convolverNode: ConvolverNode        | null = null;
  private outputGainNode: GainNode            | null = null;
  private _gain = 0.5;
  private _irLoaded = false;

  readonly nam: NamProcessor;

  constructor() {
    this.nam = new NamProcessor();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(options: AudioEngineOptions = {}): Promise<void> {
    this.context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 }) as AudioContextWithSink;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: options.inputDeviceId ? { exact: options.inputDeviceId } : undefined,
          echoCancellation:  false,
          noiseSuppression:  false,
          autoGainControl:   false,
          sampleRate:        48000,
        },
      });
    } catch (err) {
      this.context.close();
      this.context = null;
      throw err;
    }

    if (this.context.state === 'suspended') await this.context.resume();
    if (options.outputDeviceId) await this.setOutputDevice(options.outputDeviceId);

    // --- Source ---
    this.sourceNode = this.context.createMediaStreamSource(this.stream);

    // --- Analyser (level meter reads from here) ---
    this.analyserNode = this.context.createAnalyser();
    this.analyserNode.fftSize = 1024;
    this.analyserNode.smoothingTimeConstant = 0.6;

    // --- Mono downmix ---
    // Guitar arrives as stereo stream (signal on one channel, silence on the other).
    // Force to 1 channel so it sounds centered regardless of which channel is active.
    const monoSum = this.context.createGain();
    monoSum.channelCount     = 1;
    monoSum.channelCountMode = 'explicit';
    monoSum.channelInterpretation = 'speakers';

    // --- Pre-gain (Gain knob) ---
    this.preGainNode = this.context.createGain();
    this.preGainNode.gain.value = this._gain * 4;

    // --- NAM AudioWorklet ---
    await this.context.audioWorklet.addModule('/worklets/nam-processor.js');
    this.workletNode = new AudioWorkletNode(this.context, 'nam-processor');
    this.nam.attach(this.workletNode); // bridges worklet ↔ ONNX on main thread

    // --- Cabinet IR (ConvolverNode) ---
    // Initialised with a dirac delta so it acts as a passthrough until an IR is loaded.
    this.convolverNode = this.context.createConvolver();
    this.convolverNode.normalize = false;
    this.convolverNode.buffer    = makeDirac(this.context);

    // --- Output gain ---
    this.outputGainNode = this.context.createGain();
    this.outputGainNode.gain.value = 0.6;

    // --- Connect the chain ---
    // source → monoSum → analyser → preGain → NAM worklet → cab IR → output → speakers
    this.sourceNode.connect(monoSum);
    monoSum.connect(this.analyserNode);
    this.analyserNode.connect(this.preGainNode);
    this.preGainNode.connect(this.workletNode);
    this.workletNode.connect(this.convolverNode);
    this.convolverNode.connect(this.outputGainNode);
    this.outputGainNode.connect(this.context.destination);
  }

  stop(): void {
    this.nam.detach();
    this.sourceNode?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.context?.close();
    this.context        = null;
    this.stream         = null;
    this.sourceNode     = null;
    this.analyserNode   = null;
    this.preGainNode    = null;
    this.workletNode    = null;
    this.convolverNode  = null;
    this.outputGainNode = null;
    this._irLoaded      = false;
  }

  // ---------------------------------------------------------------------------
  // Model / IR loading (can be called before or after start())
  // ---------------------------------------------------------------------------

  async loadNamModel(file: File): Promise<void> {
    await this.nam.loadModel(file);
  }

  async loadCabIR(file: File): Promise<void> {
    if (!this.context || !this.convolverNode) return;
    const arrayBuf    = await file.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuf);
    this.convolverNode.buffer = audioBuffer;
    this._irLoaded = true;
  }

  // ---------------------------------------------------------------------------
  // Parameter control
  // ---------------------------------------------------------------------------

  setGain(value: number): void {
    this._gain = value;
    if (!this.context || !this.preGainNode) return;
    this.preGainNode.gain.setTargetAtTime(value * 4, this.context.currentTime, 0.01);
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    if (!this.context?.setSinkId) return;
    await this.context.setSinkId(deviceId);
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  getAnalyser():   AnalyserNode | null { return this.analyserNode; }
  isNamLoaded():   boolean             { return this.nam.isLoaded(); }
  isIRLoaded():    boolean             { return this._irLoaded; }
}
