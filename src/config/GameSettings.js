export const SETTINGS_KEY = 'kawaii-sushi.preferences.v1';
export const DEFAULT_SETTINGS = Object.freeze({ masterVolume: 1, musicVolume: 0, effectsVolume: 1, menuDecorations: true });

export function browserStorage() {
  try { return globalThis.window?.localStorage ?? null; } catch { return null; }
}

export class GameSettings {
  constructor({ storage = browserStorage() } = {}) {
    this.storage = storage;
    this.values = { ...DEFAULT_SETTINGS };
    this.listeners = new Set();
    try {
      const saved = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? '{}');
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (this.valid(key, saved?.[key])) this.values[key] = this.normalize(key, saved[key]);
      }
    } catch { /* Preferências locais inválidas ou indisponíveis: usar os padrões. */ }
  }

  valid(key, value) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) return false;
    return key === 'menuDecorations' ? typeof value === 'boolean' : typeof value === 'number' && Number.isFinite(value);
  }

  normalize(key, value) { return key === 'menuDecorations' ? value : Math.max(0, Math.min(1, value)); }

  set(key, value) {
    if (!this.valid(key, value)) return false;
    this.values[key] = this.normalize(key, value);
    try { this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.values)); } catch { /* Manter em memória. */ }
    for (const listener of this.listeners) listener(this.values);
    return true;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.values);
    return () => this.listeners.delete(listener);
  }
}

export const gameSettings = new GameSettings();
