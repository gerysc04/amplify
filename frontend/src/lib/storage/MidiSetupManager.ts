import type { MidiSetup, MidiMapping } from '../../types/audio';

const KEY = 'amplify-midi-setups';

function loadAll(): MidiSetup[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { return []; }
}

function saveAll(setups: MidiSetup[]): void {
  localStorage.setItem(KEY, JSON.stringify(setups));
}

export const midiSetupManager = {
  list(): MidiSetup[] {
    return loadAll();
  },

  create(name: string): MidiSetup {
    const setup: MidiSetup = { id: crypto.randomUUID(), name, is_active: false, mappings: [] };
    const all = loadAll();
    all.push(setup);
    saveAll(all);
    return setup;
  },

  save(setup: MidiSetup): void {
    const all = loadAll();
    const idx = all.findIndex((s) => s.id === setup.id);
    if (idx !== -1) all[idx] = setup;
    saveAll(all);
  },

  activate(id: string): MidiSetup[] {
    const all = loadAll();
    all.forEach((s) => { s.is_active = s.id === id; });
    saveAll(all);
    return all;
  },

  remove(id: string): void {
    saveAll(loadAll().filter((s) => s.id !== id));
  },

  addMapping(setupId: string, mapping: MidiMapping): void {
    const all = loadAll();
    const s = all.find((x) => x.id === setupId);
    if (s) { s.mappings.push(mapping); saveAll(all); }
  },
};
