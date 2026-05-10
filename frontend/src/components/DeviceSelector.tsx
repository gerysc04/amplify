import styles from './DeviceSelector.module.css';

interface DeviceSelectorProps {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  inputId: string;
  outputId: string;
  onInputChange: (id: string) => void;
  onOutputChange: (id: string) => void;
  running: boolean;
}

function deviceLabel(device: MediaDeviceInfo, index: number, kind: string): string {
  return device.label || `${kind} ${index + 1}`;
}

export default function DeviceSelector({
  inputs, outputs,
  inputId, outputId,
  onInputChange, onOutputChange,
  running,
}: DeviceSelectorProps) {
  return (
    <div className={styles.row}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Input</span>
        <select
          className={styles.select}
          value={inputId}
          onChange={(e) => onInputChange(e.target.value)}
          disabled={running}
          title={running ? 'Stop audio to change input device' : undefined}
        >
          <option value="">Default</option>
          {inputs.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {deviceLabel(d, i, 'Input')}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Output</span>
        <select
          className={styles.select}
          value={outputId}
          onChange={(e) => onOutputChange(e.target.value)}
        >
          <option value="">Default</option>
          {outputs.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {deviceLabel(d, i, 'Output')}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
