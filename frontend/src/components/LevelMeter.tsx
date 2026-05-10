import { useEffect, useRef } from 'react';
import styles from './LevelMeter.module.css';

interface LevelMeterProps {
  analyserNode: AnalyserNode | null;
}

const SEGMENTS = 18;
const YELLOW_FROM = 12;
const RED_FROM = 15;

const SEG_LIT: string[] = Array.from({ length: SEGMENTS }, (_, i) => {
  if (i >= RED_FROM)    return '#e53935';
  if (i >= YELLOW_FROM) return '#fdd835';
  return '#43a047';
});

const SEG_DIM: string[] = Array.from({ length: SEGMENTS }, (_, i) => {
  if (i >= RED_FROM)    return '#2a1010';
  if (i >= YELLOW_FROM) return '#1e1a08';
  return '#0d1a0e';
});

export default function LevelMeter({ analyserNode }: LevelMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    const segW = W / SEGMENTS;
    const gap = 2;

    const drawEmpty = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < SEGMENTS; i++) {
        ctx.fillStyle = SEG_DIM[i];
        ctx.fillRect(i * segW + gap / 2, 0, segW - gap, H);
      }
    };

    if (!analyserNode) {
      drawEmpty();
      return;
    }

    const bufLen = analyserNode.fftSize;
    const data   = new Float32Array(bufLen);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyserNode.getFloatTimeDomainData(data);

      let sum = 0;
      for (let i = 0; i < bufLen; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / bufLen);

      // Map −60 dB → 0 dB to 0 → 1
      const db    = 20 * Math.log10(Math.max(rms, 1e-6));
      const level = Math.max(0, Math.min(1, (db + 60) / 60));
      const lit   = Math.round(level * SEGMENTS);

      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < SEGMENTS; i++) {
        ctx.fillStyle = i < lit ? SEG_LIT[i] : SEG_DIM[i];
        ctx.fillRect(i * segW + gap / 2, 0, segW - gap, H);
      }
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserNode]);

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>IN</span>
      <canvas ref={canvasRef} className={styles.canvas} width={252} height={14} />
    </div>
  );
}
