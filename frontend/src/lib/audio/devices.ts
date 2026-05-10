export interface AudioDevices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}

export async function enumerateAudioDevices(): Promise<AudioDevices> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    inputs:  all.filter((d) => d.kind === 'audioinput'),
    outputs: all.filter((d) => d.kind === 'audiooutput'),
  };
}
