// setSinkId is Chrome 110+ — not yet in the standard TS dom lib.
type AudioContextWithSink = AudioContext & {
  setSinkId?(deviceId: string): Promise<void>;
};

// Soft-clip distortion curve. amount 0–400.
// Cast to Float32Array<ArrayBuffer> — TS6 tightened typed array generics and
// WaveShaperNode.curve requires the concrete ArrayBuffer variant.
function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 256;
  const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export interface AudioEngineOptions {
  inputDeviceId?: string;
  outputDeviceId?: string;
}

export class AudioEngine {
  private context: AudioContextWithSink | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private preGainNode: GainNode | null = null;
  private waveShaperNode: WaveShaperNode | null = null;
  private outputGainNode: GainNode | null = null;
  private _gain = 0.5;

  async start(options: AudioEngineOptions = {}): Promise<void> {
    // AudioContext must be created synchronously inside the user gesture —
    // do this before the async getUserMedia call.
    this.context = new AudioContext({ sampleRate: 48000 }) as AudioContextWithSink;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: options.inputDeviceId ? { exact: options.inputDeviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        },
      });
    } catch (err) {
      this.context.close();
      this.context = null;
      throw err;
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    if (options.outputDeviceId) {
      await this.setOutputDevice(options.outputDeviceId);
    }

    this.sourceNode = this.context.createMediaStreamSource(this.stream);

    this.analyserNode = this.context.createAnalyser();
    this.analyserNode.fftSize = 1024;
    this.analyserNode.smoothingTimeConstant = 0.6;

    // A mono guitar jack on a stereo interface arrives as a 2-channel stream with
    // signal on one channel and silence on the other (which channel depends on the
    // interface). Downmix everything to 1 channel so the signal always comes through,
    // then the rest of the chain upmixes back to stereo (both ears).
    const monoSum = this.context.createGain();
    monoSum.channelCount = 1;
    monoSum.channelCountMode = 'explicit';
    monoSum.channelInterpretation = 'speakers';
    this.sourceNode.connect(monoSum);
    monoSum.connect(this.analyserNode);

    // Pre-gain: maps Gain knob (0–1) to 0–4× amplitude boost.
    this.preGainNode = this.context.createGain();
    this.preGainNode.gain.value = this._gain * 4;

    this.waveShaperNode = this.context.createWaveShaper();
    this.waveShaperNode.curve = makeDistortionCurve(this._gain * 400);
    this.waveShaperNode.oversample = '4x';

    // Output gain keeps the signal at a sane level after the wave shaper.
    this.outputGainNode = this.context.createGain();
    this.outputGainNode.gain.value = 0.6;

    this.analyserNode.connect(this.preGainNode);
    this.preGainNode.connect(this.waveShaperNode);
    this.waveShaperNode.connect(this.outputGainNode);
    this.outputGainNode.connect(this.context.destination);
  }

  setGain(value: number): void {
    this._gain = value;
    if (!this.context || !this.preGainNode || !this.waveShaperNode) return;
    this.preGainNode.gain.setTargetAtTime(value * 4, this.context.currentTime, 0.01);
    this.waveShaperNode.curve = makeDistortionCurve(value * 400);
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    if (!this.context?.setSinkId) return;
    await this.context.setSinkId(deviceId);
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  stop(): void {
    this.sourceNode?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.context?.close();
    this.context = null;
    this.stream = null;
    this.sourceNode = null;
    this.analyserNode = null;
    this.preGainNode = null;
    this.waveShaperNode = null;
    this.outputGainNode = null;
  }
}
