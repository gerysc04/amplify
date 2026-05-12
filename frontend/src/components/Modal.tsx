import { useEffect } from 'react';
import styles from './Modal.module.css';

interface Props {
  title:      string;
  onClose:    () => void;
  fullscreen?: boolean;
  children:   React.ReactNode;
}

export default function Modal({ title, onClose, fullscreen, children }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (fullscreen) {
    return (
      <div className={styles.overlay}>
        <div className={styles.fullsheet}>
          <div className={styles.header}>
            <span className={styles.title}>{title}</span>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlayCenter} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.sheet}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
