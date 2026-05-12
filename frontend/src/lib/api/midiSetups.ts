import type { MidiSetup } from '../../types/audio';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  // Reuse the same auth fetch pattern from client.ts via a simple wrapper
  const { getToken } = await import('../tone3000/client');
  const token = getToken();
  const r = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (r.status === 204) return undefined as T;
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

export const midiSetupsApi = {
  list:   ()                         => apiFetch<MidiSetup[]>('/api/midi-setups'),
  create: (name: string)             => apiFetch<MidiSetup>('/api/midi-setups', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: string, b: Partial<Pick<MidiSetup, 'name' | 'is_active' | 'mappings'>>) =>
    apiFetch<MidiSetup>(`/api/midi-setups/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  remove: (id: string)               => apiFetch<void>(`/api/midi-setups/${id}`, { method: 'DELETE' }),
};
