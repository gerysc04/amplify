import { useCallback, useEffect, useRef } from 'react';
import type { ParametricEqBand } from '../types/audio';
import styles from './ParametricEq.module.css';

interface Props {
  bands: ParametricEqBand[];
  onChange: (bands: ParametricEqBand[]) => void;
  getSpectrumData: () => Uint8Array | null;
}

const DB_MIN = -18;
const DB_MAX = 18;
const FREQ_LABELS = ['65', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
const FREQ_VALUES = [65, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spectrum: Uint8Array | null,
  sampleRate: number
) {
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, height);

  if (!spectrum || spectrum.length === 0) {
    ctx.restore();
    return;
  }

  // Draw spectrum as bars aligned to the 9 frequency positions
  const barCount = FREQ_VALUES.length;
  const barWidth = width / barCount * 0.6;
  const gap = width / barCount;

  for (let i = 0; i < barCount; i++) {
    const targetFreq = FREQ_VALUES[i];
    // Find the closest FFT bin
    const nyquist = sampleRate / 2;
    const binIdx = Math.round((targetFreq / nyquist) * (spectrum.length - 1));
    const val = spectrum[Math.min(binIdx, spectrum.length - 1)];

    // Map 0-255 to bar height
    const barHeight = (val / 255) * height * 0.85;
    const x = i * gap + (gap - barWidth) / 2;
    const y = height - barHeight;

    // Gradient from green to transparent
    const grad = ctx.createLinearGradient(0, y, 0, height);
    grad.addColorStop(0, 'rgba(126, 200, 126, 0.35)');
    grad.addColorStop(1, 'rgba(126, 200, 126, 0.02)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barWidth, barHeight);
  }

  ctx.restore();
}

export default function ParametricEq({ bands, onChange, getSpectrumData }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const sampleRate = 48000;

  // Resize canvas
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Animation loop
  useEffect(() => {
    const loop = () => {
      const canvas = canvasRef.current;
      if (!canvas) { animRef.current = requestAnimationFrame(loop); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { animRef.current = requestAnimationFrame(loop); return; }
      const spectrum = getSpectrumData();
      const rect = canvas.getBoundingClientRect();
      drawSpectrum(ctx, rect.width, rect.height, spectrum, sampleRate);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [getSpectrumData]);

  const updateGain = useCallback((idx: number, gain: number) => {
    const updated = bands.map((b, i) =>
      i === idx ? { ...b, gain: Math.max(DB_MIN, Math.min(DB_MAX, gain)) } : b
    );
    onChange(updated);
  }, [bands, onChange]);

  const toggleBand = useCallback((idx: number) => {
    const updated = bands.map((b, i) =>
      i === idx ? { ...b, enabled: !b.enabled } : b
    );
    onChange(updated);
  }, [bands, onChange]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Output EQ</span>
      </div>

      <div className={styles.eqBody}>
        {/* Spectrum canvas behind sliders */}
        <div ref={wrapRef} className={styles.spectrumWrap}>
          <canvas ref={canvasRef} className={styles.spectrumCanvas} />
        </div>

        {/* Sliders */}
        <div className={styles.sliders}>
          {bands.map((b, i) => (
            <div key={i} className={styles.sliderCol}>
              <span className={styles.valueLabel}>
                {b.gain > 0 ? '+' : ''}{b.gain.toFixed(1)}
              </span>
              <div className={styles.sliderTrack}>
                <input
                  type="range"
                  min={DB_MIN}
                  max={DB_MAX}
                  step={0.5}
                  value={b.gain}
                  disabled={!b.enabled}
                  onChange={(e) => updateGain(i, Number(e.target.value))}
                  className={`${styles.slider} ${b.enabled ? styles.sliderActive : ''}`}
                  orient="vertical"
                />
                <div
                  className={styles.sliderDot}
                  style={{
                    bottom: `${((b.gain - DB_MIN) / (DB_MAX - DB_MIN)) * 100}%`,
                    opacity: b.enabled ? 1 : 0.3,
                  }}
                />
              </div>
              <button
                className={`${styles.freqBtn} ${b.enabled ? styles.freqBtnActive : ''}`}
                onClick={() => toggleBand(i)}
              >
                {FREQ_LABELS[i]}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
