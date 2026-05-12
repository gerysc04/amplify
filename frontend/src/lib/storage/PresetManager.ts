import type { Preset } from '../../types/audio';

const STORAGE_KEY = 'amplify-presets';

function loadAll(): Preset[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

function saveAll(presets: Preset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export const presetManager = {
  list(): Preset[] { return loadAll(); },

  add(preset: Preset): void {
    const all = loadAll();
    all.push(preset);
    saveAll(all);
  },

  update(id: string, preset: Preset): void {
    const all = loadAll();
    const idx = all.findIndex((p) => p.id === id);
    if (idx !== -1) { all[idx] = preset; saveAll(all); }
  },

  remove(id: string): void {
    saveAll(loadAll().filter((p) => p.id !== id));
  },
};
