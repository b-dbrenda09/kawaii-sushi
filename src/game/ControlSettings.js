export const MOVEMENT_MODES = Object.freeze({ MAP: 'map', CAMERA: 'camera', CHARACTER: 'character' });
export const CONTROL_OPTIONS = Object.freeze([
  { id: 'map', label: 'Relativa ao mapa', description: 'W: norte (fundo), S: sul, A: oeste, D: leste.' },
  { id: 'camera', label: 'Relativa à câmera', description: 'W: frente da câmera no chão; A/D: deslocamento lateral.' },
  { id: 'character', label: 'Relativa à personagem', description: 'W/S: frente e ré; A/D: deslocamento lateral sem girar.' },
]);
const STORAGE_KEY = 'kawaii-sushi.controls.movementMode';
export class ControlSettings {
  constructor({ storage = null } = {}) {
    this.storage = storage; this.movementMode = MOVEMENT_MODES.MAP;
    try {
      const saved = storage?.getItem(STORAGE_KEY);
      if (CONTROL_OPTIONS.some(option => option.id === saved)) this.movementMode = saved;
    } catch { /* Armazenamento indisponível: a preferência dura durante a partida. */ }
  }
  setMovementMode(mode) {
    if (!CONTROL_OPTIONS.some(option => option.id === mode)) return false;
    this.movementMode = mode;
    try { this.storage?.setItem(STORAGE_KEY, mode); } catch { /* Preferência em memória. */ }
    return true;
  }
}
