// Soft-clip distortion curve. amount 0–400.
function makeDistortionCurve(amount: number): Float32Array {
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private preGainNode: GainNode | null = null;
  private waveShaperNode: WaveShaperNode | null = null;
  private outputGainNode: GainNode | null = null;
  private _gain = 0.5;

  async start(): Promise<void> {
    // AudioContext must be created synchronously inside the user gesture —
    // do this before the async getUserMedia call.
    this.context = new AudioContext({ sampleRate: 48000 });

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
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

    this.sourceNode = this.context.createMediaStreamSource(this.stream);

    this.analyserNode = this.context.createAnalyser();
    this.analyserNode.fftSize = 1024;
    this.analyserNode.smoothingTimeConstant = 0.6;

    // Pre-gain: maps Gain knob (0–1) to 0–4× amplitude boost.
    this.preGainNode = this.context.createGain();
    this.preGainNode.gain.value = this._gain * 4;

    this.waveShaperNode = this.context.createWaveShaper();
    this.waveShaperNode.curve = makeDistortionCurve(this._gain * 400);
    this.waveShaperNode.oversample = '4x';

    // Output gain keeps the signal at a sane level after the wave shaper.
    this.outputGainNode = this.context.createGain();
    this.outputGainNode.gain.value = 0.6;

    // Chain: source → analyser (for meter) → pre-gain → waveshaper → output → speakers
    this.sourceNode.connect(this.analyserNode);
    this.analyserNode.connect(this.preGainNode);
    this.preGainNode.connect(this.waveShaperNode);
    this.waveShaperNode.connect(this.outputGainNode);
    this.outputGainNode.connect(this.context.destination);
  }

  setGain(value: number): void {
    this._gain = value;
    if (!this.context || !this.preGainNode || !this.waveShaperNode) return;
    this.preGainNode.gain.setTargetAtTime(value * 4, this.context.currentTime, 0.01);
    // Rebuild the curve — no smoothing for the waveshaper, it's cheap enough.
    this.waveShaperNode.curve = makeDistortionCurve(value * 400);
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
