import { useCallback, useEffect, useRef } from 'react';
import styles from './Knob.module.css';

interface KnobProps {
  value: number;          // 0–1
  onChange: (value: number) => void;
  label: string;
  size?: number;          // rendered size in px (SVG scales internally)
  defaultValue?: number;
}

const MIN_ANGLE = -135;
const MAX_ANGLE = 135;
const DRAG_SENSITIVITY = 180; // px of vertical drag for full 0→1 range

function polarToCartesian(
  cx: number, cy: number, r: number, angleDeg: number
): { x: number; y: number } {
  // angleDeg measured from 12 o'clock, clockwise
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(
  cx: number, cy: number, r: number, startAngle: number, endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end   = polarToCartesian(cx, cy, r, endAngle);
  const sweep = ((endAngle - startAngle) + 360) % 360;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

export default function Knob({ value, onChange, label, defaultValue = 0.5 }: KnobProps) {
  const dragging   = useRef(false);
  const startY     = useRef(0);
  const startValue = useRef(0);

  const angle = MIN_ANGLE + value * (MAX_ANGLE - MIN_ANGLE);
  const cx = 50, cy = 50, trackR = 40, knobR = 32;
  const dot = polarToCartesian(cx, cy, knobR - 8, angle);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      startY.current = e.clientY;
      startValue.current = value;
      e.preventDefault();
    },
    [value]
  );

  const onDoubleClick = useCallback(() => {
    onChange(defaultValue);
  }, [onChange, defaultValue]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = (startY.current - e.clientY) / DRAG_SENSITIVITY;
      onChange(Math.max(0, Math.min(1, startValue.current + delta)));
    };
    const onMouseUp = () => { dragging.current = false; };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onChange]);

  const trackPath = describeArc(cx, cy, trackR, MIN_ANGLE, MAX_ANGLE);
  const valuePath = value > 0.001 ? describeArc(cx, cy, trackR, MIN_ANGLE, angle) : null;

  return (
    <div className={styles.wrapper}>
      <svg
        viewBox="0 0 100 100"
        className={styles.svg}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        role="slider"
        aria-label={`${label} knob`}
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <path d={trackPath} className={styles.track} />
        {valuePath && <path d={valuePath} className={styles.valueArc} />}
        <circle cx={cx} cy={cy} r={knobR} className={styles.body} />
        <circle cx={dot.x.toFixed(3)} cy={dot.y.toFixed(3)} r={3.5} className={styles.dot} />
      </svg>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
